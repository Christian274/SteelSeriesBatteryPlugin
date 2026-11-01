export const STEELSERIES_VENDOR_ID = 0x1038;

export type MouseModel = {
	id: string;
	name: string;
	productIds: readonly number[];
	batteryInterface: number;
};

export const MOUSE_MODELS: readonly MouseModel[] = [
	{
		id: "aerox-5-wireless",
		name: "Aerox 5 Wireless",
		productIds: [0x1852, 0x185c, 0x1860],
		batteryInterface: 3,
	},
];

export type HeadsetModel = {
	id: string;
	name: string;
};

export const HEADSET_MODELS: readonly HeadsetModel[] = [{ id: "arctis-gamebuds", name: "Arctis GameBuds" }];

export const DEFAULT_MOUSE_MODEL_ID = MOUSE_MODELS[0].id;
export const DEFAULT_HEADSET_MODEL_ID = HEADSET_MODELS[0].id;

export function resolveMouseModel(id: unknown): MouseModel {
	return MOUSE_MODELS.find((model) => model.id === id) ?? MOUSE_MODELS[0];
}

export function resolveHeadsetModel(id: unknown): HeadsetModel {
	return HEADSET_MODELS.find((model) => model.id === id) ?? HEADSET_MODELS[0];
}
