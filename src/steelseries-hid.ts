import { devices, HID } from "node-hid";
import { STEELSERIES_VENDOR_ID, type MouseModel } from "./devices";
import { decodeAerox5BatteryReport } from "./steelseries-protocol";

// Wireless Aerox 5 devices use command 0xD2 in report 0 to request battery data.
const BATTERY_REQUEST = [0x00, 0xd2];
const BATTERY_RESPONSE_PREFIX = 0xd2;
const MOUSE_OFF_RESPONSE_PREFIX = [0x40, 0xff];
const BATTERY_RESPONSE_TIMEOUT_MS = 1000;
const BATTERY_RESPONSE_DEADLINE_MS = 2000;
const MAX_STALE_REPORTS = 32;

export type BatteryReading =
	| { kind: "battery"; percentage: number; charging: boolean }
	| { kind: "off" }
	| { kind: "disconnected" };

export function readMouseBattery(model: MouseModel): BatteryReading {
	const candidates = devices().filter(
		(device) =>
			device.vendorId === STEELSERIES_VENDOR_ID &&
			model.productIds.includes(device.productId) &&
			device.interface === model.batteryInterface &&
			typeof device.path === "string",
	);

	if (candidates.length === 0) {
		return { kind: "disconnected" };
	}

	const errors: Error[] = [];
	for (const candidate of candidates) {
		const devicePath = candidate.path;
		if (!devicePath) {
			continue;
		}

		let device: InstanceType<typeof HID> | undefined;
		try {
			device = new HID(devicePath, { nonExclusive: true });
			for (let staleReport = 0; staleReport < MAX_STALE_REPORTS; staleReport++) {
				if (device.readTimeout(0).length === 0) {
					break;
				}
			}
			device.write(BATTERY_REQUEST);

			const deadline = Date.now() + BATTERY_RESPONSE_DEADLINE_MS;
			while (Date.now() < deadline) {
				const timeout = Math.min(BATTERY_RESPONSE_TIMEOUT_MS, deadline - Date.now());
				const report = device.readTimeout(timeout);
				if (report.length >= 3 && report[0] === BATTERY_RESPONSE_PREFIX) {
					const battery = decodeAerox5BatteryReport(report);
					return { kind: "battery", ...battery };
				}
				if (
					report.length >= 3 &&
					report[0] === MOUSE_OFF_RESPONSE_PREFIX[0] &&
					report[1] === MOUSE_OFF_RESPONSE_PREFIX[1]
				) {
					return { kind: "off" };
				}
			}
			throw new Error(`${model.name} did not return a battery report.`);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		} finally {
			device?.close();
		}
	}

	throw new AggregateError(errors, `No ${model.name} HID interface returned a valid battery report.`);
}
