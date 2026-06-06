const ownerModePinPlaceholder = 'CHANGE_ME'

// NEXT_PUBLIC values are still visible in the client bundle. This is only a
// convenience safeguard for local/team use. Real protection requires server-side
// authentication and authorization. Never store real secrets in frontend code.
const ownerModePin = process.env.NEXT_PUBLIC_OWNER_MODE_PIN || ownerModePinPlaceholder

export const OWNER_MODE_PIN_CONFIGURED =
  ownerModePin !== ownerModePinPlaceholder

export function verifyOwnerModePin(pin: string): boolean {
  return pin === ownerModePin
}
