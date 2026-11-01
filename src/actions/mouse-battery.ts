import {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { normalizeBatteryColorThresholds, type BatteryColorThresholds } from "../battery-color";
import { t } from "../i18n";
import { resolveMouseModel, type MouseModel } from "../devices";
import { readMouseBattery, type BatteryReading } from "../steelseries-hid";
import { renderMouseBatteryImage } from "../battery-image";

const REFRESH_INTERVAL_MS = 30_000;
const ERROR_RETRY_INTERVAL_MS = 5_000;
const ERROR_GRACE_PERIOD_MS = 120_000;

@action({ UUID: "com.cookienomster.steelseriesbatteryplugin.battery" })
export class MouseBattery extends SingletonAction<BatteryActionSettings> {
	private readonly visibleActions = new Map<
		string,
		{ setImage: (image: string) => Promise<void>; label: string; thresholds: BatteryColorThresholds; model: MouseModel }
	>();
	private refreshTimer: NodeJS.Timeout | undefined;
	private refreshPromise: Promise<void> | undefined;
	private readonly states = new Map<string, ModelState>();

	override async onWillAppear(ev: WillAppearEvent<BatteryActionSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		const action = ev.action;
		this.visibleActions.set(action.id, {
			setImage: (image) => action.setImage(image),
			label: normalizeLabel(ev.payload.settings.label),
			model: resolveMouseModel(ev.payload.settings.model),
			thresholds: normalizeBatteryColorThresholds(
				ev.payload.settings.greenThreshold,
				ev.payload.settings.yellowThreshold,
			),
		});

		await this.refreshVisibleActions();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<BatteryActionSettings>): Promise<void> {
		const action = ev.action;
		if (!action.isKey()) {
			return;
		}

		const visibleAction = this.visibleActions.get(action.id);
		if (!visibleAction) {
			return;
		}

		visibleAction.label = normalizeLabel(ev.payload.settings.label);
		const previousModelId = visibleAction.model.id;
		visibleAction.model = resolveMouseModel(ev.payload.settings.model);
		visibleAction.thresholds = normalizeBatteryColorThresholds(
			ev.payload.settings.greenThreshold ?? visibleAction.thresholds.greenThreshold,
			ev.payload.settings.yellowThreshold ?? visibleAction.thresholds.yellowThreshold,
		);
		if (visibleAction.model.id !== previousModelId) {
			await this.refreshVisibleActions();
			return;
		}
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
				this.scheduleRefresh([...this.states.values()].some((state) => state.lastReadFailed) ? ERROR_RETRY_INTERVAL_MS : REFRESH_INTERVAL_MS);
			}
		}
	}

	private async updateVisibleActions(): Promise<void> {
		const models = new Map<string, MouseModel>();
		for (const { model } of this.visibleActions.values()) {
			models.set(model.id, model);
		}

		for (const model of models.values()) {
			const state = this.states.get(model.id) ?? { reading: { kind: "error" }, lastReadFailed: false };
			this.states.set(model.id, state);
			try {
				state.reading = readMouseBattery(model);
				state.lastSuccessfulReadAt = Date.now();
				if (state.lastReadFailed) {
					streamDeck.logger.info(`${model.name} battery status recovered.`);
				}
				state.lastReadFailed = false;
			} catch (error) {
				if (!state.lastReadFailed) {
					streamDeck.logger.error(`Failed to read ${model.name} battery status.`, error);
				}
				state.lastReadFailed = true;
				if (
					state.lastSuccessfulReadAt === undefined ||
					Date.now() - state.lastSuccessfulReadAt >= ERROR_GRACE_PERIOD_MS
				) {
					state.reading = { kind: "error" };
				}
			}
		}

		await this.renderVisibleActions();
	}

	private async renderVisibleActions(): Promise<void> {
		for (const [context, visibleAction] of this.visibleActions) {
			try {
				await visibleAction.setImage(
					renderMouseBatteryImage(
						visibleAction.label,
						this.states.get(visibleAction.model.id)?.reading ?? { kind: "error" },
						visibleAction.thresholds,
					),
				);
			} catch (error) {
				streamDeck.logger.error(`Failed to update battery action ${context}.`, error);
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
	return normalizedLabel || t("DEFAULT_MOUSE_LABEL");
}

type ModelState = {
	reading: BatteryReading | { kind: "error" };
	lastSuccessfulReadAt?: number;
	lastReadFailed: boolean;
};

type BatteryActionSettings = {
	label?: string;
	model?: string;
	greenThreshold?: number;
	yellowThreshold?: number;
};
