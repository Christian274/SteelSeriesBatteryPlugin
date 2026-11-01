import type { BatteryReading } from "./steelseries-hid";
import { getBatteryLevelColor, type BatteryColorThresholds } from "./battery-color";
import { t } from "./i18n";

const SVG_WIDTH = 144;
const SVG_HEIGHT = 144;
const MOUSE_PATH =
	"M72 31 C56 31 46 43 46 59 V78 C46 94 57 105 72 105 C87 105 98 94 98 78 V59 C98 43 88 31 72 31 Z";

export function renderMouseBatteryImage(
	label: string,
	reading: BatteryReading | { kind: "error" },
	thresholds?: BatteryColorThresholds,
): string {
	const status = getStatusPresentation(reading);
	const mouseColor = reading.kind === "battery" ? getBatteryLevelColor(reading.percentage, thresholds) : "#cbd5e1";
	const safeLabel = escapeXml(label || t("DEFAULT_MOUSE_LABEL"));
	const percentage = reading.kind === "battery" ? `${reading.percentage}%` : "";
	const percentageColor =
		reading.kind === "battery" ? getBatteryLevelColor(reading.percentage, thresholds) : "#f8fafc";
	const chargingBolt =
		reading.kind === "battery" && reading.charging
			? '<path d="M84 46 69 66h9l-5 14 19-24h-10z" fill="#38bdf8" stroke="#e0f2fe" stroke-width="2" stroke-linejoin="round"/>'
			: "";
	const offIcon =
		reading.kind === "off"
			? '<path d="M72 49v16m-11-11a15 15 0 1 0 22 0" fill="none" stroke="#fca5a5" stroke-width="4" stroke-linecap="round"/>'
			: "";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
		<text x="72" y="19" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="14" font-weight="600" textLength="120" lengthAdjust="spacingAndGlyphs">${safeLabel}</text>
		<path d="${MOUSE_PATH}" fill="#111827"/>
		<path d="${MOUSE_PATH}" fill="none" stroke="${mouseColor}" stroke-width="3"/>
		<path d="M72 34v17" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
		<rect x="69" y="39" width="6" height="11" rx="3" fill="${mouseColor}"/>
		${chargingBolt}
		${offIcon}
		<text x="72" y="124" text-anchor="middle" fill="${percentageColor}" font-family="Arial,sans-serif" font-size="18" font-weight="700">${percentage}</text>
		<text x="72" y="140" text-anchor="middle" fill="${status.color}" font-family="Arial,sans-serif" font-size="10" font-weight="700" textLength="122" lengthAdjust="spacingAndGlyphs">${status.label}</text>
	</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function getStatusPresentation(reading: BatteryReading | { kind: "error" }): { label: string; color: string } {
	switch (reading.kind) {
		case "battery":
			return reading.charging ? { label: t("STATUS_CHARGING"), color: "#7dd3fc" } : { label: t("STATUS_BATTERY"), color: "#cbd5e1" };
		case "off":
			return { label: t("STATUS_OFF"), color: "#fca5a5" };
		case "disconnected":
			return { label: t("STATUS_NOT_CONNECTED"), color: "#cbd5e1" };
		case "error":
			return { label: t("STATUS_READ_ERROR"), color: "#fca5a5" };
	}
}

function escapeXml(value: string): string {
	return value.replace(/[<>&'"]/g, (character) => {
		switch (character) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&apos;";
			default:
				return "&quot;";
		}
	});
}
