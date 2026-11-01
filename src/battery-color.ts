export const DEFAULT_GREEN_THRESHOLD = 75;
export const DEFAULT_YELLOW_THRESHOLD = 35;

export type BatteryColorThresholds = {
	greenThreshold: number;
	yellowThreshold: number;
};

export function normalizeBatteryColorThresholds(green: unknown, yellow: unknown): BatteryColorThresholds {
	return {
		greenThreshold: normalizeThreshold(green, DEFAULT_GREEN_THRESHOLD),
		yellowThreshold: normalizeThreshold(yellow, DEFAULT_YELLOW_THRESHOLD),
	};
}

export function getBatteryLevelColor(
	percentage: number,
	thresholds: BatteryColorThresholds = {
		greenThreshold: DEFAULT_GREEN_THRESHOLD,
		yellowThreshold: DEFAULT_YELLOW_THRESHOLD,
	},
): string {
	if (percentage >= thresholds.greenThreshold) {
		return "#4ade80";
	}
	if (percentage >= thresholds.yellowThreshold) {
		return "#fbbf24";
	}
	return "#f87171";
}

function normalizeThreshold(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.round(Math.min(100, Math.max(0, value)));
}
