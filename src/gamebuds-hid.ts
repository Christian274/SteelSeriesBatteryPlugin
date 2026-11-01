import { devices, HID } from "node-hid";

import { STEELSERIES_VENDOR_ID } from "./devices";

const GAMEBUDS_DONGLE_PRODUCT_ID = 0x230a;
const GAMEBUDS_CASE_PRODUCT_ID = 0x230c;
const GAMEBUDS_COMMAND_USAGE_PAGE = 0xffc0;
const GAMEBUDS_COMMAND_INTERFACE = 3;
const GAMEBUDS_REPORT_LENGTH = 64;
const GAMEBUDS_RESPONSE_TIMEOUT_MS = 1000;
const GAMEBUDS_RESPONSE_DEADLINE_MS = 2000;
const MAX_STALE_REPORTS = 32;

export type GameBudsBatteryLevel = {
	percentage: number;
	charging?: boolean;
	inCase?: boolean;
	connectionState: "connected" | "disconnected" | "unknown";
};

export type GameBudsBatteryReading = {
	left: GameBudsBatteryLevel;
	right: GameBudsBatteryLevel;
	chargingStatusError?: Error;
};

export function decodeGameBudsDongleReport(report: readonly number[]): {
	left: GameBudsBatteryLevel;
	right: GameBudsBatteryLevel;
} {
	if (report.length < 7 || report[0] !== 0xb0) {
		throw new Error("Arctis GameBuds dongle returned an incomplete battery report.");
	}

	// The 0xB0 status frame reports connection at bytes 3-4 and battery at 5-6.
	return {
		left: { ...parseBatteryLevel(report[5]), connectionState: parseConnectionState(report[3]) },
		right: { ...parseBatteryLevel(report[6]), connectionState: parseConnectionState(report[4]) },
	};
}

export function decodeGameBudsCaseChargingReport(report: readonly number[]): {
	left: { charging: boolean; inCase: boolean };
	right: { charging: boolean; inCase: boolean };
} {
	if (report.length < 7 || report[0] !== 0xb7) {
		throw new Error("Arctis GameBuds case returned an incomplete charging report.");
	}
	return {
		left: parseCaseChargingState(report[4]),
		right: parseCaseChargingState(report[5]),
	};
}

export function readGameBudsBattery(): GameBudsBatteryReading {
	const candidates = devices().filter(
		(device) =>
			device.vendorId === STEELSERIES_VENDOR_ID &&
			(device.productId === GAMEBUDS_DONGLE_PRODUCT_ID || device.productId === GAMEBUDS_CASE_PRODUCT_ID) &&
			device.usagePage === GAMEBUDS_COMMAND_USAGE_PAGE &&
			device.interface === GAMEBUDS_COMMAND_INTERFACE &&
			typeof device.path === "string",
	);
	const dongleCandidates = candidates.filter((device) => device.productId === GAMEBUDS_DONGLE_PRODUCT_ID);
	const caseCandidates = candidates.filter((device) => device.productId === GAMEBUDS_CASE_PRODUCT_ID);
	const dongleReport = readCommandReport(dongleCandidates, 0xb0, 7);
	const reading = decodeGameBudsDongleReport(dongleReport);
	let chargingStatusError: Error | undefined;

	if (caseCandidates.length > 0) {
		try {
			const caseReport = readCommandReport(caseCandidates, 0xb7, 7);
			const charging = decodeGameBudsCaseChargingReport(caseReport);
			reading.left = { ...reading.left, ...charging.left };
			reading.right = { ...reading.right, ...charging.right };
		} catch (error) {
			chargingStatusError = toError(error);
		}
	}

	return { ...reading, chargingStatusError };
}

function readCommandReport(
	candidates: ReturnType<typeof devices>,
	command: number,
	minimumLength: number,
): number[] {
	const errors: Error[] = [];

	for (const candidate of candidates) {
		if (!candidate.path) {
			continue;
		}

		let device: InstanceType<typeof HID> | undefined;
		try {
			device = new HID(candidate.path, { nonExclusive: true });
			for (let staleReport = 0; staleReport < MAX_STALE_REPORTS; staleReport++) {
				if (device.readTimeout(0).length === 0) {
					break;
				}
			}

			const report = [0, command, ...new Array<number>(GAMEBUDS_REPORT_LENGTH - 1).fill(0)];
			device.write(report);

			const deadline = Date.now() + GAMEBUDS_RESPONSE_DEADLINE_MS;
			while (Date.now() < deadline) {
				const timeout = Math.min(GAMEBUDS_RESPONSE_TIMEOUT_MS, deadline - Date.now());
				const response = normalizeReport(device.readTimeout(timeout), command);
				if (response && response.length >= minimumLength) {
					return response;
				}
			}
			throw new Error(`Arctis GameBuds did not return a 0x${command.toString(16)} report.`);
		} catch (error) {
			errors.push(toError(error));
		} finally {
			device?.close();
		}
	}

	throw new AggregateError(errors, `Unable to read Arctis GameBuds command 0x${command.toString(16)}.`);
}

function normalizeReport(report: number[], command: number): number[] | undefined {
	if (report[0] === command) {
		return report;
	}
	if (report[0] === 0 && report[1] === command) {
		return report.slice(1);
	}
	return undefined;
}

function parseBatteryLevel(value: number): GameBudsBatteryLevel {
	if (!Number.isInteger(value) || value < 0 || value > 100) {
		throw new Error(`Arctis GameBuds returned an invalid battery level (${value}).`);
	}
	return { percentage: value, connectionState: "unknown" };
}

function parseConnectionState(value: number): GameBudsBatteryLevel["connectionState"] {
	if (value === 3) {
		return "connected";
	}
	if (value >= 0 && value <= 2) {
		return "disconnected";
	}
	throw new Error(`Arctis GameBuds returned an invalid connection state (${value}).`);
}

function parseCaseChargingState(status: number): { charging: boolean; inCase: boolean } {
	if (!Number.isInteger(status) || status < 0 || status > 2) {
		throw new Error(`Arctis GameBuds returned an invalid charging state (${status}).`);
	}
	return { charging: status === 1, inCase: status === 2 };
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
