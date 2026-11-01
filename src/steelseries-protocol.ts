export type BatteryStatus = {
	percentage: number;
	charging: boolean;
};

const CHARGING_FLAG = 0x80;
const BATTERY_LEVEL_MASK = 0x7f;
const BATTERY_REPORT_PREFIX = 0xd2;
const MIN_BATTERY_LEVEL = 0;
const MAX_BATTERY_LEVEL = 21;
const PERCENT_PER_LEVEL = 5;

export function decodeAerox5BatteryReport(report: readonly number[]): BatteryStatus {
	if (report.length < 3 || report[0] !== BATTERY_REPORT_PREFIX) {
		throw new Error("Aerox 5 Wireless returned an incomplete battery report.");
	}

	const encodedLevel = report[1];
	const level = encodedLevel & BATTERY_LEVEL_MASK;
	if (level < MIN_BATTERY_LEVEL || level > MAX_BATTERY_LEVEL) {
		throw new Error(`Aerox 5 Wireless returned an invalid battery level (${level}).`);
	}

	return {
		percentage: level === MIN_BATTERY_LEVEL ? 0 : (level - 1) * PERCENT_PER_LEVEL,
		charging: (encodedLevel & CHARGING_FLAG) !== 0,
	};
}
