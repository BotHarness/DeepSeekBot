export interface MemberInvitation {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
}

export interface MemberPairingOffer extends MemberInvitation {
  receipt: string;
}
