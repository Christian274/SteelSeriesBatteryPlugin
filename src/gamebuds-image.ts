import { getBatteryLevelColor, type BatteryColorThresholds } from "./battery-color";
import type { GameBudsBatteryLevel, GameBudsBatteryReading } from "./gamebuds-hid";
import { t } from "./i18n";

const SVG_WIDTH = 144;
const SVG_HEIGHT = 144;
const BATTERY_WIDTH = 44;
const BATTERY_HEIGHT = 69;
const BATTERY_TOP = 36;
const BATTERY_BOTTOM = BATTERY_TOP + BATTERY_HEIGHT;

export function renderGameBudsImage(
	label: string,
	reading: GameBudsBatteryReading | { kind: "error" },
	thresholds?: BatteryColorThresholds,
): string {
	const safeLabel = escapeXml(label || "GameBuds");
	const left = "kind" in reading ? undefined : reading.left;
	const right = "kind" in reading ? undefined : reading.right;
	const columns = [
		renderBattery(48, "L", left, thresholds),
		renderBattery(96, "R", right, thresholds),
	].join("");
	const footer = "kind" in reading ? { label: t("STATUS_READ_ERROR"), color: "#fca5a5" } : undefined;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
		<text x="72" y="18" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="14" font-weight="600" textLength="120" lengthAdjust="spacingAndGlyphs">${safeLabel}</text>
		${columns}
		${footer ? `<text x="72" y="137" text-anchor="middle" fill="${footer.color}" font-family="Arial,sans-serif" font-size="9" font-weight="700" textLength="122" lengthAdjust="spacingAndGlyphs">${footer.label}</text>` : ""}
	</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function renderBattery(
	center: number,
	label: string,
	battery: GameBudsBatteryLevel | undefined,
	thresholds?: BatteryColorThresholds,
): string {
	const isDisconnected = battery?.connectionState === "disconnected" && !battery.charging && !battery.inCase;
	const color = battery && !isDisconnected ? getBatteryLevelColor(battery.percentage, thresholds) : "#64748b";
	const fillHeight = battery && !isDisconnected ? Math.round((BATTERY_HEIGHT * battery.percentage) / 100) : 0;
	const fillY = BATTERY_BOTTOM - fillHeight;
	const bodyX = center - BATTERY_WIDTH / 2;
	const status = battery?.charging ? t("STATUS_CHARGING") : battery?.inCase ? t("STATUS_IN_CASE") : isDisconnected ? t("STATUS_DISCONNECTED") : "";
	const statusColor = battery?.charging ? "#7dd3fc" : "#cbd5e1";
	const chargeBolt =
		battery?.charging
			? `<path d="M${center + 7} 58 ${center - 4} 73h7l-3 12 13-18h-8z" fill="#38bdf8" stroke="#e0f2fe" stroke-width="1" stroke-linejoin="round"/>`
			: "";
	const disconnectedIcon = isDisconnected
		? `<path d="M${center - 6} 66h12m-9-4 9 8m-9 0 9-8" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>`
		: "";

	return `<g>
		<text x="${center}" y="32" text-anchor="middle" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="11" font-weight="700">${label}</text>
		<defs><clipPath id="battery-${label}"><rect x="${bodyX + 3}" y="${BATTERY_TOP + 3}" width="${BATTERY_WIDTH - 6}" height="${BATTERY_HEIGHT - 6}" rx="5"/></clipPath></defs>
		<rect x="${bodyX}" y="${BATTERY_TOP}" width="${BATTERY_WIDTH}" height="${BATTERY_HEIGHT}" rx="8" fill="#111827"/>
		<rect x="${bodyX + 3}" y="${fillY}" width="${BATTERY_WIDTH - 6}" height="${fillHeight}" fill="${color}" clip-path="url(#battery-${label})"/>
		<rect x="${bodyX}" y="${BATTERY_TOP}" width="${BATTERY_WIDTH}" height="${BATTERY_HEIGHT}" rx="8" fill="none" stroke="${color}" stroke-width="3"/>
		<rect x="${center - 7}" y="33" width="14" height="5" rx="2" fill="${color}"/>
		${chargeBolt}
		${disconnectedIcon}
		<text x="${center}" y="121" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="14" font-weight="700">${battery ? `${battery.percentage}%` : "--"}</text>
		<text x="${center}" y="137" text-anchor="middle" fill="${statusColor}" font-family="Arial,sans-serif" font-size="9" font-weight="700">${status}</text>
	</g>`;
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
