import streamDeck, {
	action,
	SingletonAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { normalizeBatteryColorThresholds, type BatteryColorThresholds } from "../battery-color";
import { renderDialImage, type DialReading } from "../dial-image";
import { HEADSET_MODELS, MOUSE_MODELS } from "../devices";
import { readGameBudsBattery } from "../gamebuds-hid";
import { readMouseBattery } from "../steelseries-hid";

const REFRESH_INTERVAL_MS = 30_000;
const ROTATE_STALE_MS = 5_000;
const ERROR_GRACE_PERIOD_MS = 120_000;

type DialItem = { id: string; name: string; isMouse: boolean; read: () => DialReading };

// Carousel order: all supported mice, then all supported headsets.
const ITEMS: readonly DialItem[] = [
	...MOUSE_MODELS.map(
		(model): DialItem => ({
			id: model.id,
			name: model.name,
			isMouse: true,
			read: () => ({ type: "mouse", reading: readMouseBattery(model) }),
		}),
	),
	...HEADSET_MODELS.map(
		(model): DialItem => ({
			id: model.id,
			name: model.name,
			isMouse: false,
			read: () => {
				const { left, right } = readGameBudsBattery();
				return { type: "headset", left, right, error: false };
			},
		}),
	),
];

type CacheEntry = { data?: DialReading; lastSuccessAt?: number; readAt?: number; failed: boolean };
type VisibleDial = {
	setFeedback: (feedback: { canvas: string }) => Promise<void>;
	index: number;
	items: readonly DialItem[];
	thresholds: BatteryColorThresholds;
};

@action({ UUID: "com.cookienomster.steelseriesbatteryplugin.dial" })
export class BatteryDial extends SingletonAction<DialSettings> {
	private readonly dials = new Map<string, VisibleDial>();
	private readonly cache = new Map<string, CacheEntry>();
	private refreshTimer: NodeJS.Timeout | undefined;

	override async onWillAppear(ev: WillAppearEvent<DialSettings>): Promise<void> {
		if (!ev.action.isDial()) {
			return;
		}

		const dial = ev.action;
		this.dials.set(dial.id, {
			setFeedback: (feedback) => dial.setFeedback(feedback),
			index: 0,
			items: selectItems(ev.payload.settings.devices),
			thresholds: normalizeBatteryColorThresholds(
				ev.payload.settings.greenThreshold,
				ev.payload.settings.yellowThreshold,
			),
		});

		await this.refreshVisibleItems();
	}

	override onWillDisappear(ev: WillDisappearEvent<DialSettings>): void {
		this.dials.delete(ev.action.id);
		if (this.dials.size === 0 && this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialSettings>): Promise<void> {
		const dial = this.dials.get(ev.action.id);
		if (!dial) {
			return;
		}
		dial.thresholds = normalizeBatteryColorThresholds(
			ev.payload.settings.greenThreshold,
			ev.payload.settings.yellowThreshold,
		);
		const currentId = dial.items[dial.index]?.id;
		dial.items = selectItems(ev.payload.settings.devices);
		const keptIndex = dial.items.findIndex((item) => item.id === currentId);
		dial.index = keptIndex >= 0 ? keptIndex : 0;
		await this.refreshVisibleItems();
	}

	override async onDialRotate(ev: DialRotateEvent<DialSettings>): Promise<void> {
		await this.step(ev.action.id, ev.payload.ticks > 0 ? 1 : -1);
	}

	override async onTouchTap(ev: TouchTapEvent<DialSettings>): Promise<void> {
		await this.step(ev.action.id, 1);
	}

	override async onDialDown(ev: DialDownEvent<DialSettings>): Promise<void> {
		const dial = this.dials.get(ev.action.id);
		if (dial) {
			this.readItem(dial.items[dial.index]);
			await this.renderAll();
		}
	}

	private async step(id: string, direction: 1 | -1): Promise<void> {
		const dial = this.dials.get(id);
		if (!dial) {
			return;
		}

		dial.index = (dial.index + direction + dial.items.length) % dial.items.length;
		const item = dial.items[dial.index];
		const readAt = this.cache.get(item.id)?.readAt;
		await this.render(dial);

		if (!readAt || Date.now() - readAt > ROTATE_STALE_MS) {
			this.readItem(item);
			await this.render(dial);
		}
	}

	private async refreshVisibleItems(): Promise<void> {
		const visible = new Set([...this.dials.values()].map((dial) => dial.items[dial.index]));
		for (const item of visible) {
			this.readItem(item);
		}
		await this.renderAll();

		if (this.dials.size > 0) {
			if (this.refreshTimer) {
				clearTimeout(this.refreshTimer);
			}
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = undefined;
				void this.refreshVisibleItems();
			}, REFRESH_INTERVAL_MS);
		}
	}

	private readItem(item: DialItem): void {
		const entry = this.cache.get(item.id) ?? { failed: false };
		this.cache.set(item.id, entry);
		entry.readAt = Date.now();

		try {
			entry.data = item.read();
			entry.lastSuccessAt = Date.now();
			if (entry.failed) {
				streamDeck.logger.info(`${item.name} battery status recovered.`);
			}
			entry.failed = false;
		} catch (error) {
			if (!entry.failed) {
				streamDeck.logger.error(`Failed to read ${item.name} battery status.`, error);
			}
			entry.failed = true;
			if (entry.lastSuccessAt === undefined || Date.now() - entry.lastSuccessAt >= ERROR_GRACE_PERIOD_MS) {
				entry.data = undefined;
			}
		}
	}

	private async renderAll(): Promise<void> {
		for (const dial of this.dials.values()) {
			await this.render(dial);
		}
	}

	private async render(dial: VisibleDial): Promise<void> {
		const item = dial.items[dial.index];
		const data = this.cache.get(item.id)?.data ?? errorReading(item);
		try {
			await dial.setFeedback({
				canvas: renderDialImage(item.name, dial.index, dial.items.length, data, dial.thresholds),
			});
		} catch (error) {
			streamDeck.logger.error("Failed to update battery dial.", error);
		}
	}
}

function errorReading(item: DialItem): DialReading {
	return item.isMouse ? { type: "mouse", reading: { kind: "error" } } : { type: "headset", error: true };
}

// No selection (or an unknown one) means all devices.
function selectItems(selected: unknown): readonly DialItem[] {
	if (!Array.isArray(selected)) {
		return ITEMS;
	}
	const items = ITEMS.filter((item) => selected.includes(item.id));
	return items.length > 0 ? items : ITEMS;
}

type DialSettings = {
	devices?: string[];
	greenThreshold?: number;
	yellowThreshold?: number;
};
