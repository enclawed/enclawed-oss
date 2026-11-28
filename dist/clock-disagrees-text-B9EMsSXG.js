//#region src/enclawed/hardware-root/clock-disagrees-text.ts
/**
* What a person reads for a "clock-disagrees" refusal (shared by every TOTP surface).
* Unplugging while a prompt holds the device latches it DIRTY, so the advice to
* replug always comes after cancelling the prompt.
*/
const CLOCK_DISAGREES_TEXT = "the Enclaweder's clock and this computer's disagree: check this computer's time (set it to update automatically), then type a new code. If it keeps happening, first cancel this prompt (Ctrl-C), then unplug and replug the Enclaweder";
//#endregion
export { CLOCK_DISAGREES_TEXT as t };
