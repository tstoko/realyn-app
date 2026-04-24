/**
 * Seeded demo logins (mirror `functions/src/lib/*DemoConstants.ts`).
 * Shown on the login page in dev / emulator builds so you can sign in without hunting constants.
 */
export interface DemoLoginAccount {
  label: string;
  email: string;
  password: string;
}

export const DEMO_LOGIN_ACCOUNTS: DemoLoginAccount[] = [
  { label: 'Skiddle — event ticketing', email: 'demo@skiddle.com', password: 'skiddle2026!' },
  { label: 'DICE', email: 'demo@dice.fm', password: 'dice2026!' },
  { label: 'Nimax Theatres', email: 'demo@nimaxtheatres.com', password: 'nimax2026!' },
  { label: 'Zip World', email: 'demo@zipworld.co.uk', password: 'zipworld2026!' },
  { label: "Sadler's Wells", email: 'demo@sadlerswells.com', password: 'sadlerswells2026!' },
  {
    label: 'Attraction World Group — experiences & API distribution',
    email: 'demo@attractionworldgroup.com',
    password: 'awg2026!',
  },
];
