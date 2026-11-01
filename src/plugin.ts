import streamDeck from "@elgato/streamdeck";

import { GameBudsBattery } from "./actions/gamebuds-battery";
import { BatteryDial } from "./actions/battery-dial";
import { MouseBattery } from "./actions/mouse-battery";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new MouseBattery());
streamDeck.actions.registerAction(new GameBudsBattery());
streamDeck.actions.registerAction(new BatteryDial());

streamDeck.connect();
