import { getBatteryLevelColor, type BatteryColorThresholds } from "./battery-color";
import type { GameBudsBatteryLevel } from "./gamebuds-hid";
import { t } from "./i18n";
import type { BatteryReading } from "./steelseries-hid";

const WIDTH = 200;
const HEIGHT = 100;
const NEUTRAL = "#cbd5e1";
const ERROR = "#fca5a5";
const CHARGING = "#7dd3fc";

export type DialReading =
	| { type: "mouse"; reading: BatteryReading | { kind: "error" } }
	| { type: "headset"; left?: GameBudsBatteryLevel; right?: GameBudsBatteryLevel; error: boolean };

type Block = {
	centerX: number;
	width: number;
	caption?: string;
	percentage?: number;
	status: string;
	statusColor: string;
};

export function renderDialImage(
	title: string,
	position: number,
	count: number,
	data: DialReading,
	thresholds?: BatteryColorThresholds,
): string {
	const blocks = data.type === "mouse" ? [mouseBlock(data.reading)] : headsetBlocks(data);
	const body = blocks.map((block) => renderBlock(block, thresholds)).join("");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
		<rect width="${WIDTH}" height="${HEIGHT}" fill="#0f172a"/>
		${renderDots(position, count)}
		<text x="100" y="28" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="16" font-weight="600" textLength="${Math.min(180, title.length * 9)}" lengthAdjust="spacingAndGlyphs">${escapeXml(title)}</text>
		${body}
	</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function mouseBlock(reading: BatteryReading | { kind: "error" }): Block {
	const base = { centerX: 100, width: 140 };
	switch (reading.kind) {
		case "battery":
			return {
				...base,
				percentage: reading.percentage,
				status: reading.charging ? t("STATUS_CHARGING") : "",
				statusColor: CHARGING,
			};
		case "off":
			return { ...base, status: t("STATUS_OFF"), statusColor: ERROR };
		case "disconnected":
			return { ...base, status: t("STATUS_NOT_CONNECTED"), statusColor: NEUTRAL };
		case "error":
			return { ...base, status: t("STATUS_READ_ERROR"), statusColor: ERROR };
	}
}

function headsetBlocks(data: Extract<DialReading, { type: "headset" }>): Block[] {
	const side = (centerX: number, caption: string, battery?: GameBudsBatteryLevel): Block => {
		const base = { centerX, width: 76, caption };
		if (data.error || !battery) {
			return { ...base, status: data.error ? t("STATUS_READ_ERROR") : "", statusColor: ERROR };
		}
		const disconnected = battery.connectionState === "disconnected" && !battery.charging && !battery.inCase;
		const status = battery.charging
			? t("STATUS_CHARGING")
			: battery.inCase
				? t("STATUS_IN_CASE")
				: disconnected
					? t("STATUS_DISCONNECTED")
					: "";
		return {
			...base,
			percentage: battery.percentage,
			status,
			statusColor: battery.charging ? CHARGING : NEUTRAL,
		};
	};
	return [side(50, "L", data.left), side(150, "R", data.right)];
}

function renderBlock(block: Block, thresholds?: BatteryColorThresholds): string {
	const { centerX, width, caption, percentage, status, statusColor } = block;
	const color = percentage === undefined ? NEUTRAL : getBatteryLevelColor(percentage, thresholds);
	const value = percentage === undefined ? "--" : `${percentage}%`;
	const barX = centerX - width / 2;
	const fill = percentage === undefined ? 0 : Math.max(0, Math.min(100, percentage)) * ((width - 4) / 100);
	const valueText = caption ? `${caption} ${value}` : value;

	return `
		<text x="${centerX}" y="62" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="${caption ? 22 : 30}" font-weight="700">${valueText}</text>
		<rect x="${barX}" y="70" width="${width}" height="10" rx="3" fill="none" stroke="${color}" stroke-width="2"/>
		<rect x="${barX + 2}" y="72" width="${fill}" height="6" rx="1.5" fill="${color}"/>
		<text x="${centerX}" y="95" text-anchor="middle" fill="${statusColor}" font-family="Arial,sans-serif" font-size="10" font-weight="700">${escapeXml(status)}</text>`;
}

function renderDots(position: number, count: number): string {
	const spacing = 12;
	const start = 100 - ((count - 1) * spacing) / 2;
	return Array.from(
		{ length: count },
		(_, index) =>
			`<circle cx="${start + index * spacing}" cy="9" r="3" fill="${index === position ? "#f8fafc" : "#475569"}"/>`,
	).join("");
}

function escapeXml(value: string): string {
	return value.replace(/[<>&"']/g, (char) => {
		switch (char) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case '"':
				return "&quot;";
			default:
				return "&apos;";
		}
	});
}
