// The story and its missions. Vic Torres comes home to Solmar owing Madame
// Oro $50,000; eight jobs pay the debt down and end with the big score.
// Missions are built from small stage constructors below (one per objective
// kind) so the story reads as a list of jobs, not a wall of nested objects;
// the world only ever sees the plain stage objects they return.

export const STORY_INTRO = [
  'SOLMAR, 2026. Vic Torres is back after five years away.',
  'Madame Oro owns his debt: $50,000. She owns his garage too.',
  'Eight jobs. Pay it all back. Then the city is his.',
];

// --- stage constructors ---------------------------------------------------
// Every stage is { type, text, ... } — the world switches on type and reads
// target / radius / seconds / stars / count / carKind / pickupKind as needed.
const enterCar = (text) => ({ type: 'enterCar', text });
const goTo = (target, radius, text) => ({ type: 'goto', target, radius, text });
const steal = (carKind, target, radius, text) => ({ type: 'steal', carKind, target, radius, text });
const deliver = (target, radius, text) => ({ type: 'deliver', target, radius, text });
const timed = (target, radius, seconds, text) => ({ type: 'timed', target, radius, seconds, text });
const wanted = (stars, text) => ({ type: 'wanted', stars, text });
const survive = (seconds, text) => ({ type: 'survive', seconds, text });
const loseWanted = (target, radius, text) => ({ type: 'loseWanted', target, radius, text });
const pickup = (pickupKind, target, radius, text) => ({ type: 'pickup', pickupKind, target, radius, text });
const eliminate = (count, target, radius, text) => ({ type: 'eliminate', count, target, radius, text });
const attackVan = (text) => ({ type: 'attackVan', text });
const collect = (count, target, radius, text) => ({ type: 'collect', count, target, radius, text });

function mission(id, name, brief, reward, dialogue, stages) {
  return { id, name, brief, reward, dialogue, stages };
}

export const MISSIONS = [
  mission('welcome', 'Welcome Home',
    'Walk to your car and drive to the Safehouse.', 500,
    [
      'ORO: Vic. You owe me fifty grand. Start driving.',
      'VIC: Yeah, yeah. Where to?',
      'ORO: Your old safehouse. Get there in one piece.',
    ],
    [
      enterCar('Get in your car'),
      goTo('safehouse', 90, 'Drive to the Safehouse'),
    ]),
  mission('hotproperty', 'Hot Property',
    'Steal the red Comet GT from the Marina lot and bring it to the Garage.', 1000,
    [
      'ORO: A red Comet GT is parked down at the Marina. I want it.',
      'VIC: Stealing cars on day one? Fine. It is a nice car.',
    ],
    [
      steal('sport', 'marinaLot', 80, 'Steal the red Comet GT'),
      deliver('garage', 90, 'Deliver the Comet to the Garage'),
    ]),
  mission('getaway', 'Getaway Driver',
    'Pick up Lenny at the Docks, then lose a 2-star wanted level.', 2000,
    [
      'LENNY: Vic! Cops are on me after that warehouse thing!',
      'VIC: Get in. And try not to throw up in my car.',
    ],
    [
      goTo('docksDrop', 90, 'Pick up Lenny at the Docks'),
      wanted(2, 'The cops are on you — drive!'),
      loseWanted('safehouse', 90, 'Lose the cops, then reach the Safehouse'),
    ]),
  mission('thedrop', 'The Drop',
    'Deliver the package to the Casino in 100 seconds. No scratches.', 3000,
    [
      'ORO: A package for the Casino del Sol. One hundred seconds.',
      'VIC: Traffic is murder at this hour. I will make it.',
    ],
    [
      timed('casino', 90, 100, 'Deliver to the Casino del Sol'),
    ]),
  mission('sweeper', 'Street Sweeper',
    'Clear the Vipers out of the Old Town alley. Take the pistol first.', 5000,
    [
      'ORO: The Vipers moved into Old Town. That is my turf.',
      'VIC: So I go in loud? I like loud.',
    ],
    [
      pickup('gun', 'gunShop', 80, 'Pick up the pistol at the Gun Shop'),
      eliminate(5, 'alley', 260, 'Take out the Vipers (0/5)'),
    ]),
  mission('heatwave', 'Heat Wave',
    'Survive a 3-star wanted level for 60 seconds, then get a respray.', 7000,
    [
      'ORO: The whole department is looking for you, Vic.',
      'VIC: Then I will give them a show. Then a new paint job.',
    ],
    [
      wanted(3, '3 stars! Survive the heat!'),
      survive(60, 'Survive! 60s'),
      goTo('sprayShop', 90, 'Get a respray at the Spray Shop'),
    ]),
  mission('payday', 'Payday',
    'Ram the bank van until it stops, grab the cash, escape to the Safehouse.', 12000,
    [
      'ORO: A bank van rolls through Downtown every morning.',
      'VIC: And I am supposed to just... take it? Okay. Okay!',
    ],
    [
      attackVan('Ram the bank van until it stops'),
      collect(1, 'bankVan', 70, 'Grab the cash'),
      loseWanted('safehouse', 90, 'Escape to the Safehouse'),
    ]),
  mission('bigscore', 'The Big Score',
    'Steal the vault car from the Casino, survive 4 stars, deliver to the Docks.', 19500,
    [
      'ORO: The vault car leaves the Casino tonight. One last job, Vic.',
      'VIC: After this, Solmar is mine. Let us finish it.',
    ],
    [
      steal('sport', 'casino', 90, 'Steal the vault car at the Casino'),
      wanted(4, '4 stars! The whole city is after you!'),
      deliver('docksDrop', 100, 'Deliver the vault car to the Docks'),
    ]),
];

// --- mission state ----------------------------------------------------------
// index: which mission is active (0..7), -1 once the story is done.
// stage: which stage of it. spawned: entities this mission created, by key.
export function createMissionState() {
  return {
    index: 0,
    stage: 0,
    timer: 0,
    active: false,
    done: false,
    banner: null, // {text, sub, t}
    dialogue: [], // lines waiting to be shown
    dialogueIndex: 0,
    spawned: {},
    stageProgress: 0,
  };
}

export function currentMission(state) {
  if (state.index < 0 || state.index >= MISSIONS.length) return null;
  return MISSIONS[state.index];
}

export function currentStage(state) {
  const m = currentMission(state);
  return m ? (m.stages[state.stage] ?? null) : null;
}

/** Start a mission: banner, dialogue, reset stage tracking. */
export function startMission(state, index) {
  const m = MISSIONS[index];
  state.index = index;
  state.stage = 0;
  state.timer = 0;
  state.stageProgress = 0;
  state.spawned = {};
  state.active = true;
  state.done = false;
  state.banner = { text: m.name, sub: m.brief, t: 3.2 };
  state.dialogue = [...m.dialogue];
  state.dialogueIndex = 0;
}

/** Advance to the next stage, or finish the mission. Returns 'done' or 'stage'. */
export function advanceMission(state) {
  const m = currentMission(state);
  if (!m) return 'done';
  state.stage += 1;
  state.timer = 0;
  state.stageProgress = 0;
  if (state.stage >= m.stages.length) {
    state.active = false;
    state.done = true;
    return 'done';
  }
  return 'stage';
}

/** Mark the story complete: no more missions, free roam with a crown. */
export function finishStory(state) {
  state.index = -1;
  state.active = false;
  state.done = true;
  state.banner = { text: 'KING OF SOLMAR', sub: 'The debt is paid. The city is yours — free roam!', t: 4 };
}
