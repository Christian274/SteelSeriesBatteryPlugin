import {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { normalizeBatteryColorThresholds, type BatteryColorThresholds } from "../battery-color";
import { resolveHeadsetModel } from "../devices";
import { readGameBudsBattery, type GameBudsBatteryReading } from "../gamebuds-hid";
import { renderGameBudsImage } from "../gamebuds-image";

const REFRESH_INTERVAL_MS = 30_000;
const ERROR_RETRY_INTERVAL_MS = 5_000;
const ERROR_GRACE_PERIOD_MS = 120_000;
const DEFAULT_LABEL = "GameBuds";

@action({ UUID: "com.cookienomster.steelseriesbatteryplugin.gamebuds" })
export class GameBudsBattery extends SingletonAction<GameBudsActionSettings> {
	private readonly visibleActions = new Map<
		string,
		{ setImage: (image: string) => Promise<void>; label: string; thresholds: BatteryColorThresholds; modelId: string }
	>();
	private refreshTimer: NodeJS.Timeout | undefined;
	private refreshPromise: Promise<void> | undefined;
	private latestReading: GameBudsBatteryReading | { kind: "error" } = { kind: "error" };
	private lastSuccessfulReadAt: number | undefined;
	private lastReadFailed = false;
	private lastChargingStatusFailed = false;

	override async onWillAppear(ev: WillAppearEvent<GameBudsActionSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		const action = ev.action;
		this.visibleActions.set(action.id, {
			setImage: (image) => action.setImage(image),
			label: normalizeLabel(ev.payload.settings.label),
			modelId: resolveHeadsetModel(ev.payload.settings.model).id,
			thresholds: normalizeBatteryColorThresholds(
				ev.payload.settings.greenThreshold,
				ev.payload.settings.yellowThreshold,
			),
		});

		await this.refreshVisibleActions();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GameBudsActionSettings>): Promise<void> {
		const action = ev.action;
		if (!action.isKey()) {
			return;
		}

		const visibleAction = this.visibleActions.get(action.id);
		if (!visibleAction) {
			return;
		}

		visibleAction.label = normalizeLabel(ev.payload.settings.label);
		visibleAction.modelId = resolveHeadsetModel(ev.payload.settings.model).id;
		visibleAction.thresholds = normalizeBatteryColorThresholds(
			ev.payload.settings.greenThreshold ?? visibleAction.thresholds.greenThreshold,
			ev.payload.settings.yellowThreshold ?? visibleAction.thresholds.yellowThreshold,
		);
		await this.renderVisibleActions();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.visibleActions.delete(ev.action.id);

		if (this.visibleActions.size === 0 && this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private async refreshVisibleActions(): Promise<void> {
		if (this.refreshPromise) {
			return this.refreshPromise;
		}

		this.refreshPromise = this.updateVisibleActions();
		try {
			await this.refreshPromise;
		} finally {
			this.refreshPromise = undefined;
			if (this.visibleActions.size > 0) {
				this.scheduleRefresh(this.lastReadFailed ? ERROR_RETRY_INTERVAL_MS : REFRESH_INTERVAL_MS);
			}
		}
	}

	private async updateVisibleActions(): Promise<void> {
		try {
			this.latestReading = readGameBudsBattery();
			this.lastSuccessfulReadAt = Date.now();
			if (this.lastReadFailed) {
				streamDeck.logger.info("Arctis GameBuds battery status recovered.");
			}
			this.lastReadFailed = false;
			if (this.latestReading.chargingStatusError && !this.lastChargingStatusFailed) {
				streamDeck.logger.error(
					"Unable to read Arctis GameBuds charging state from the USB-connected case.",
					this.latestReading.chargingStatusError,
				);
			} else if (!this.latestReading.chargingStatusError && this.lastChargingStatusFailed) {
				streamDeck.logger.info("Arctis GameBuds charging status recovered.");
			}
			this.lastChargingStatusFailed = this.latestReading.chargingStatusError !== undefined;
		} catch (error) {
			if (!this.lastReadFailed) {
				streamDeck.logger.error("Failed to read Arctis GameBuds battery status.", error);
			}
			this.lastReadFailed = true;
			this.lastChargingStatusFailed = false;
			if (
				this.lastSuccessfulReadAt === undefined ||
				Date.now() - this.lastSuccessfulReadAt >= ERROR_GRACE_PERIOD_MS
			) {
				this.latestReading = { kind: "error" };
			}
		}

		await this.renderVisibleActions();
	}

	private async renderVisibleActions(): Promise<void> {
		for (const [context, visibleAction] of this.visibleActions) {
			try {
				await visibleAction.setImage(
					renderGameBudsImage(visibleAction.label, this.latestReading, visibleAction.thresholds),
				);
			} catch (error) {
				streamDeck.logger.error(`Failed to update GameBuds action ${context}.`, error);
			}
		}
	}

	private scheduleRefresh(delay: number): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined;
			void this.refreshVisibleActions();
		}, delay);
	}
}

function normalizeLabel(label: unknown): string {
	const normalizedLabel = typeof label === "string" ? label.trim().slice(0, 18) : undefined;
	return normalizedLabel || DEFAULT_LABEL;
}

type GameBudsActionSettings = {
	label?: string;
	model?: string;
	greenThreshold?: number;
	yellowThreshold?: number;
};
