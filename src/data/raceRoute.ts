export type RiskLevel = 'low' | 'medium' | 'high' | 'severe'

export type SegmentType =
  | 'drive'
  | 'climb'
  | 'descent'
  | 'flat'
  | 'stop'
  | 'controlled_stop'
  | 'town'
  | 'caution'
  | 'mandatory_trailer'

export type RouteSegment = {
  mileStart: number
  mileEnd: number
  title: string
  type: SegmentType
  risk: RiskLevel
  notes: string
  strategy: string
  scoringMiles?: number
  transportMiles?: number
  startLocationName?: string
  endLocationName?: string
  routeCoordinates?: Array<{ lat: number; lng: number }>
}

export type RoutePoint = {
  mile: number
  lat: number
  lng: number
  label?: string
  note?: string
}

export type RaceDay = {
  day: number
  date: string
  start: string
  end: string
  distanceMiles: number
  physicalDistanceMiles?: number
  scoringDistanceMiles?: number
  mandatoryTraileringMiles?: number
  highways: string[]
  riskLevel: RiskLevel
  terrainSummary: string
  strategySummary: string
  simulation: {
    estimatedWhPerMile: number
    estimatedBatteryUse: string
    solarRecovery: string
    regenOpportunity: string
  }
  routePoints: RoutePoint[]
  segments: RouteSegment[]
}

export const raceRoute: RaceDay[] = [
  {
    day: 1,
    date: 'July 19, 2026',
    start: 'Fort Worth, TX',
    end: 'Palestine, TX',
    distanceMiles: 153.6,
    physicalDistanceMiles: 215.7,
    scoringDistanceMiles: 153.6,
    mandatoryTraileringMiles: 62.1,
    highways: ['TX 114', 'TX 51', 'TX 171', 'TX 22', 'US 287', 'US 79'],
    riskLevel: 'medium',
    terrainSummary:
      'A long opening stage through north and east Texas with mixed small towns, rolling farm roads, and navigation changes across several highways.',
    strategySummary:
      'Keep speed conservative early, use each town as a systems check, and protect battery margin before the longer US 79 run into Palestine.',
    simulation: {
      estimatedWhPerMile: 168,
      estimatedBatteryUse: '25.8 kWh',
      solarRecovery: '6.1 kWh',
      regenOpportunity: 'Low to moderate',
    },
    routePoints: [
      { mile: 0, lat: 32.7555, lng: -97.3308, label: 'Fort Worth', note: 'Urban race start and traffic discipline zone.' },
      { mile: 25.5, lat: 32.9657, lng: -97.6836, label: 'Springtown', note: 'TX 114/TX 51 corridor begins opening up.' },
      { mile: 43.2, lat: 32.7593, lng: -97.7973, label: 'Weatherford', note: 'Town traffic and route confirmation.' },
      { mile: 73.5, lat: 32.3476, lng: -97.3867, label: 'Cleburne', note: 'Rolling terrain south of the metroplex.' },
      { mile: 100.2, lat: 32.0109, lng: -97.1300, label: 'Hillsboro', note: 'Central Texas route transition.' },
      { mile: 126.7, lat: 32.0954, lng: -96.4689, label: 'Corsicana', note: 'US 287/US 79 positioning.' },
      { mile: 153.6, lat: 31.7621, lng: -95.6308, label: 'Palestine', note: 'End-of-day arrival control.' },
    ],
    segments: [
      {
        mileStart: 0,
        mileEnd: 18.5,
        title: 'Fort Worth departure',
        type: 'caution',
        risk: 'medium',
        notes: 'Urban edge traffic, team spacing, and early course discipline matter before the route settles.',
        strategy: 'Hold a predictable pace, avoid aggressive passes, and confirm telemetry links before open-road cruising.',
      },
      {
        mileStart: 18.5,
        mileEnd: 43.2,
        title: 'TX 114 to TX 51 transition',
        type: 'flat',
        risk: 'low',
        notes: 'Generally manageable terrain with route changes that can create convoy compression.',
        strategy: 'Use this section to establish the day baseline Wh/mile and keep battery draw below target.',
      },
      {
        mileStart: 43.2,
        mileEnd: 64.8,
        title: 'Weatherford and Granbury corridor',
        type: 'town',
        risk: 'medium',
        notes: 'More intersections, local traffic, and speed changes around town approaches.',
        strategy: 'Prioritize clean stops, smooth acceleration, and radio confirmation at each highway change.',
      },
      {
        mileStart: 64.8,
        mileEnd: 88.1,
        title: 'Rolling central stretch',
        type: 'climb',
        risk: 'medium',
        notes: 'Short rollers can quietly raise consumption if the driver chases speed over every crest.',
        strategy: 'Cap power on climbs and let speed return naturally on the backsides.',
      },
      {
        mileStart: 88.1,
        mileEnd: 111.4,
        title: 'TX 22 approach',
        type: 'caution',
        risk: 'medium',
        notes: 'Navigation load increases as the route moves between smaller highways.',
        strategy: 'Have the navigator call next-turn timing early and keep chase spacing tidy.',
      },
      {
        mileStart: 111.4,
        mileEnd: 134.6,
        title: 'US 287 connector',
        type: 'flat',
        risk: 'low',
        notes: 'A useful recovery section if winds stay manageable.',
        strategy: 'Target steady-state efficiency and use sunlight windows to rebuild margin.',
      },
      {
        mileStart: 134.6,
        mileEnd: 153.6,
        title: 'US 79 into Palestine',
        type: 'town',
        risk: 'medium',
        notes: 'End-of-day fatigue combines with traffic and town arrival procedures.',
        strategy: 'Preserve a final 10-mile battery buffer and run arrival checks before entering control.',
      },
      {
        mileStart: 25.5,
        mileEnd: 69.9,
        title: 'Mandatory trailering: Springtown to Godley',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section from the Springtown area toward Godley.',
        strategy: 'Battery preserved while the solar car is transported; use the clock window for systems checks and solar charging if conditions allow.',
        scoringMiles: 0,
        transportMiles: 44.4,
        startLocationName: 'Springtown area',
        endLocationName: 'Godley area',
        routeCoordinates: [
          { lat: 32.97906, lng: -97.69099 },
          { lat: 32.45655, lng: -97.54476 },
        ],
      },
      {
        mileStart: 109.4,
        mileEnd: 120.5,
        title: 'Mandatory trailering: US 287 connector',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section on the Day 1 eastern connector.',
        strategy: 'Treat this as battery preservation and possible solar recovery time, not driven race mileage.',
        scoringMiles: 0,
        transportMiles: 11.1,
        startLocationName: 'US 287 connector west',
        endLocationName: 'US 287 connector east',
        routeCoordinates: [
          { lat: 32.0849, lng: -96.50292 },
          { lat: 32.03541, lng: -96.37859 },
        ],
      },
      {
        mileStart: 146.9,
        mileEnd: 153.6,
        title: 'Mandatory trailering: Palestine arrival',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section into the Palestine control area.',
        strategy: 'Arrive with battery preserved; do not count these miles as solar-car-driven scoring distance.',
        scoringMiles: 0,
        transportMiles: 6.7,
        startLocationName: 'Palestine approach',
        endLocationName: 'Palestine High School area',
        routeCoordinates: [
          { lat: 31.78889, lng: -95.67295 },
          { lat: 31.73844, lng: -95.60602 },
        ],
      },
    ],
  },
  {
    day: 2,
    date: 'July 20, 2026',
    start: 'Palestine, TX',
    end: 'Round Rock, TX',
    distanceMiles: 142.1,
    physicalDistanceMiles: 155.1,
    scoringDistanceMiles: 142.1,
    mandatoryTraileringMiles: 13.0,
    highways: ['US 79'],
    riskLevel: 'medium',
    terrainSummary:
      'A mostly US 79 day with long steady running, small-town transitions, and energy risk tied to heat, traffic rhythm, and crosswind exposure.',
    strategySummary:
      'Settle into efficient cruising early, avoid over-driving through town clusters, and keep enough reserve for the Round Rock approach.',
    simulation: {
      estimatedWhPerMile: 162,
      estimatedBatteryUse: '23.0 kWh',
      solarRecovery: '6.4 kWh',
      regenOpportunity: 'Low',
    },
    routePoints: [
      { mile: 0, lat: 31.7621, lng: -95.6308, label: 'Palestine', note: 'US 79 rollout.' },
      { mile: 35.4, lat: 31.4638, lng: -96.0580, label: 'Buffalo', note: 'Small-town speed transition.' },
      { mile: 51.6, lat: 31.3616, lng: -96.1441, label: 'Jewett', note: 'Rolling highway section.' },
      { mile: 76.4, lat: 31.0260, lng: -96.4852, label: 'Franklin', note: 'Midday heat and traffic checkpoint.' },
      { mile: 103.7, lat: 30.6555, lng: -97.0014, label: 'Rockdale', note: 'US 79 town corridor.' },
      { mile: 130.2, lat: 30.5427, lng: -97.5467, label: 'Hutto', note: 'Metro approach begins.' },
      { mile: 142.1, lat: 30.5083, lng: -97.6789, label: 'Round Rock', note: 'Urban arrival procedure.' },
    ],
    segments: [
      {
        mileStart: 0,
        mileEnd: 21.3,
        title: 'Palestine rollout',
        type: 'town',
        risk: 'medium',
        notes: 'Morning departure includes local traffic and stop-start inefficiency.',
        strategy: 'Warm systems gently and avoid early current spikes while tires and driver rhythm settle.',
      },
      {
        mileStart: 21.3,
        mileEnd: 43.7,
        title: 'US 79 steady cruise',
        type: 'flat',
        risk: 'low',
        notes: 'Open highway rhythm allows clean efficiency measurements.',
        strategy: 'Lock target speed to live Wh/mile instead of schedule pressure.',
      },
      {
        mileStart: 43.7,
        mileEnd: 61.5,
        title: 'Small-town speed zones',
        type: 'caution',
        risk: 'medium',
        notes: 'Repeated speed changes can drain energy if acceleration is abrupt.',
        strategy: 'Use gentle launches and regenerative braking where traffic allows.',
      },
      {
        mileStart: 61.5,
        mileEnd: 82.4,
        title: 'Midday heat exposure',
        type: 'flat',
        risk: 'medium',
        notes: 'Cabin heat, battery temperature, and tire pressure become strategy variables.',
        strategy: 'Monitor pack temperature and trade a small speed reduction for thermal stability if needed.',
      },
      {
        mileStart: 82.4,
        mileEnd: 101.8,
        title: 'Taylor area approach',
        type: 'town',
        risk: 'medium',
        notes: 'Traffic density increases as the route nears the Austin metro edge.',
        strategy: 'Tighten communication cadence and keep driver workload low.',
      },
      {
        mileStart: 101.8,
        mileEnd: 125.9,
        title: 'Late-stage open road',
        type: 'flat',
        risk: 'low',
        notes: 'Potential chance to regain schedule without much climbing penalty.',
        strategy: 'Only increase pace if battery margin and solar input are both above plan.',
      },
      {
        mileStart: 125.9,
        mileEnd: 142.1,
        title: 'Round Rock arrival',
        type: 'caution',
        risk: 'high',
        notes: 'Urban traffic and navigation complexity can erase gains late in the day.',
        strategy: 'Switch to arrival mode early, prioritize safety spacing, and keep energy reserve intact.',
      },
      {
        mileStart: 0,
        mileEnd: 7.5,
        title: 'Mandatory trailering: Palestine rollout',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section leaving Palestine.',
        strategy: 'Battery preserved while transported; use the time for checks and solar recovery when available.',
        scoringMiles: 0,
        transportMiles: 7.5,
        startLocationName: 'Palestine High School area',
        endLocationName: 'Palestine west approach',
        routeCoordinates: [
          { lat: 31.7386, lng: -95.60642 },
          { lat: 31.70891, lng: -95.71269 },
        ],
      },
      {
        mileStart: 130.2,
        mileEnd: 135.7,
        title: 'Mandatory trailering: Hutto to Dell Diamond',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section approaching the Round Rock control area.',
        strategy: 'Do not charge Wh/mile against the car for this section; treat it as battery-preservation time.',
        scoringMiles: 0,
        transportMiles: 5.5,
        startLocationName: 'Hutto area',
        endLocationName: 'Dell Diamond area',
        routeCoordinates: [
          { lat: 30.54378, lng: -97.5418 },
          { lat: 30.52566, lng: -97.63113 },
        ],
      },
    ],
  },
  {
    day: 3,
    date: 'July 21, 2026',
    start: 'Round Rock, TX',
    end: 'Fredericksburg, TX',
    distanceMiles: 66.7,
    physicalDistanceMiles: 114.6,
    scoringDistanceMiles: 66.7,
    mandatoryTraileringMiles: 47.9,
    highways: ['TX 29', 'US 281', 'US 290'],
    riskLevel: 'high',
    terrainSummary:
      'Texas Hill Country stage with repeated big uphill and downhill sections around Johnson City and the Fredericksburg approach.',
    strategySummary:
      'Treat this as the hardest terrain day: climb with strict power limits, harvest descents where possible, and avoid speed targets that punish the pack.',
    simulation: {
      estimatedWhPerMile: 212,
      estimatedBatteryUse: '14.1 kWh',
      solarRecovery: '3.2 kWh',
      regenOpportunity: 'High',
    },
    routePoints: [
      { mile: 0, lat: 30.5083, lng: -97.6789, label: 'Round Rock', note: 'Departure before Hill Country terrain.' },
      { mile: 14.8, lat: 30.6649, lng: -97.9225, label: 'Liberty Hill', note: 'Rising rollers begin.' },
      { mile: 31.5, lat: 30.7582, lng: -98.2284, label: 'Burnet', note: 'Climb and descent rhythm strengthens.' },
      { mile: 43.4, lat: 30.5782, lng: -98.2728, label: 'Marble Falls', note: 'Terrain and traffic workload.' },
      { mile: 54.7, lat: 30.2769, lng: -98.4119, label: 'Johnson City', note: 'High-risk Hill Country grade zone.' },
      { mile: 66.7, lat: 30.2752, lng: -98.8719, label: 'Fredericksburg', note: 'Final approach remains terrain active.' },
    ],
    segments: [
      {
        mileStart: 0,
        mileEnd: 9.8,
        title: 'Round Rock exit',
        type: 'caution',
        risk: 'medium',
        notes: 'Traffic and route discipline dominate before the Hill Country profile starts to bite.',
        strategy: 'Keep the opening pace calm and verify cooling before the first climbing sequence.',
      },
      {
        mileStart: 9.8,
        mileEnd: 20.6,
        title: 'TX 29 rising rollers',
        type: 'climb',
        risk: 'high',
        notes: 'Repeated uphill pushes can multiply current draw in a short distance.',
        strategy: 'Set a hard climb power ceiling and accept lower crest speeds.',
      },
      {
        mileStart: 20.6,
        mileEnd: 28.4,
        title: 'Hill Country descent set',
        type: 'descent',
        risk: 'medium',
        notes: 'Downhill sections offer recovery but may include curves and traffic.',
        strategy: 'Use regen lightly where stable and avoid wasting energy braking late.',
      },
      {
        mileStart: 28.4,
        mileEnd: 36.9,
        title: 'Johnson City approach',
        type: 'town',
        risk: 'high',
        notes: 'Terrain, town traffic, and navigation converge in a high-workload area.',
        strategy: 'Assign clear radio calls and prepare for a conservative town transit.',
      },
      {
        mileStart: 36.9,
        mileEnd: 46.7,
        title: 'US 290 climbing sequence',
        type: 'climb',
        risk: 'severe',
        notes: 'Large uphill sections can become battery-risk events if attacked too hard.',
        strategy: 'Run energy-first pacing and trailer if pack temperature or current exceeds thresholds.',
      },
      {
        mileStart: 46.7,
        mileEnd: 55.8,
        title: 'Long downhill recovery',
        type: 'descent',
        risk: 'medium',
        notes: 'Potential for meaningful regen and thermal relief.',
        strategy: 'Let gravity carry speed, keep aero clean, and log regen yield for Phase 2 modeling.',
      },
      {
        mileStart: 55.8,
        mileEnd: 66.7,
        title: 'Fredericksburg approach',
        type: 'climb',
        risk: 'high',
        notes: 'Final terrain is still active, and arrival pressure can tempt overuse of battery.',
        strategy: 'Protect the last reserve and finish with smooth, deliberate pacing.',
      },
      {
        mileStart: 0,
        mileEnd: 11.8,
        title: 'Mandatory trailering: Dell Diamond to Liberty Hill',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section leaving the Round Rock control area.',
        strategy: 'Battery preserved during transport; use this as a solar charging and systems-check opportunity.',
        scoringMiles: 0,
        transportMiles: 11.8,
        startLocationName: 'Dell Diamond area',
        endLocationName: 'Liberty Hill area',
        routeCoordinates: [
          { lat: 30.52562, lng: -97.63111 },
          { lat: 30.63319, lng: -97.69384 },
        ],
      },
      {
        mileStart: 31.5,
        mileEnd: 65.8,
        title: 'Mandatory trailering: Burnet to Johnson City',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section through a Hill Country corridor.',
        strategy: 'Preserve battery through this control section; model clock time separately from driven scoring miles.',
        scoringMiles: 0,
        transportMiles: 34.3,
        startLocationName: 'Burnet area',
        endLocationName: 'Johnson City area',
        routeCoordinates: [
          { lat: 30.73954, lng: -98.23524 },
          { lat: 30.27864, lng: -98.41202 },
        ],
      },
      {
        mileStart: 64.9,
        mileEnd: 66.7,
        title: 'Mandatory trailering: Fredericksburg arrival',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section into Fredericksburg.',
        strategy: 'Battery should remain preserved across this arrival transport window.',
        scoringMiles: 0,
        transportMiles: 1.8,
        startLocationName: 'Fredericksburg approach',
        endLocationName: 'Fredericksburg control area',
        routeCoordinates: [
          { lat: 30.25813, lng: -98.85304 },
          { lat: 30.27635, lng: -98.87404 },
        ],
      },
    ],
  },
  {
    day: 4,
    date: 'July 22, 2026',
    start: 'Fredericksburg, TX',
    end: 'San Angelo, TX',
    distanceMiles: 144.6,
    physicalDistanceMiles: 144.6,
    scoringDistanceMiles: 144.6,
    mandatoryTraileringMiles: 0,
    highways: ['US 87', 'US 67'],
    riskLevel: 'severe',
    terrainSummary:
      'Heavy rolling hills through Mason, Brady, and Eden, then windfarm and open terrain with several trailer-risk climbs.',
    strategySummary:
      'This is the highest energy management risk day: bank energy early, trailer before compounding losses, and manage wind exposure as actively as terrain.',
    simulation: {
      estimatedWhPerMile: 228,
      estimatedBatteryUse: '33.0 kWh',
      solarRecovery: '5.7 kWh',
      regenOpportunity: 'Moderate to high',
    },
    routePoints: [
      { mile: 0, lat: 30.2752, lng: -98.8719, label: 'Fredericksburg', note: 'Immediate rolling terrain.' },
      { mile: 39.6, lat: 30.7488, lng: -99.2306, label: 'Mason', note: 'Heavy rollers and trailer-risk climbs.' },
      { mile: 68.2, lat: 31.1352, lng: -99.3351, label: 'Brady', note: 'Town control and thermal check.' },
      { mile: 105.7, lat: 31.2163, lng: -99.8456, label: 'Eden', note: 'Climb risk zone before open terrain.' },
      { mile: 144.6, lat: 31.4638, lng: -100.4370, label: 'San Angelo', note: 'End-of-day city arrival.' },
    ],
    segments: [
      {
        mileStart: 0,
        mileEnd: 17.9,
        title: 'Fredericksburg departure climbs',
        type: 'climb',
        risk: 'high',
        notes: 'The day starts with meaningful terrain before the team has much data for conditions.',
        strategy: 'Begin under target speed and let live consumption decide whether to press later.',
      },
      {
        mileStart: 17.9,
        mileEnd: 35.6,
        title: 'Mason rolling hills',
        type: 'climb',
        risk: 'severe',
        notes: 'Heavy rollers can stack into sustained high draw.',
        strategy: 'Use strict crest discipline and prepare trailer criteria before entering the segment.',
      },
      {
        mileStart: 35.6,
        mileEnd: 52.4,
        title: 'Descent recovery pockets',
        type: 'descent',
        risk: 'medium',
        notes: 'Useful downhill relief appears between hill groups.',
        strategy: 'Favor coasting and controlled regen over speed surges.',
      },
      {
        mileStart: 52.4,
        mileEnd: 70.1,
        title: 'Brady town control',
        type: 'town',
        risk: 'medium',
        notes: 'Town operations break the terrain rhythm and add stop-start losses.',
        strategy: 'Use the town as a driver and thermal checkpoint before the next open section.',
      },
      {
        mileStart: 70.1,
        mileEnd: 91.2,
        title: 'US 87 exposed rollers',
        type: 'caution',
        risk: 'high',
        notes: 'Open terrain raises wind sensitivity while hills remain active.',
        strategy: 'Adjust speed by apparent wind and avoid chasing schedule through gusts.',
      },
      {
        mileStart: 91.2,
        mileEnd: 111.7,
        title: 'Eden climb risk zone',
        type: 'climb',
        risk: 'severe',
        notes: 'Several climbs can force trailer decisions if battery or temperature margins shrink.',
        strategy: 'Pre-brief go/no-go points and trailer early if losses compound.',
      },
      {
        mileStart: 111.7,
        mileEnd: 130.2,
        title: 'Windfarm open terrain',
        type: 'flat',
        risk: 'high',
        notes: 'Wind exposure can dominate even where grades flatten.',
        strategy: 'Drive to yaw and power stability, not just posted speed.',
      },
      {
        mileStart: 130.2,
        mileEnd: 144.6,
        title: 'San Angelo arrival',
        type: 'caution',
        risk: 'medium',
        notes: 'Late-day fatigue and traffic return as the route approaches the city.',
        strategy: 'Keep final reserve untouched and transition to arrival communications early.',
      },
    ],
  },
  {
    day: 5,
    date: 'July 23, 2026',
    start: 'San Angelo, TX',
    end: 'Fort Stockton, TX',
    distanceMiles: 112.8,
    physicalDistanceMiles: 136.4,
    scoringDistanceMiles: 112.8,
    mandatoryTraileringMiles: 23.6,
    highways: ['US 67', 'US 385'],
    riskLevel: 'high',
    terrainSummary:
      'Long open west Texas roads with shallow grades, extended downhill sections, and the most wind exposure of the route.',
    strategySummary:
      'Exploit shallow downhill efficiency without over-speeding, watch wind direction constantly, and preserve enough margin for isolated-road contingencies.',
    simulation: {
      estimatedWhPerMile: 184,
      estimatedBatteryUse: '20.8 kWh',
      solarRecovery: '6.9 kWh',
      regenOpportunity: 'Moderate',
    },
    routePoints: [
      { mile: 0, lat: 31.4638, lng: -100.4370, label: 'San Angelo', note: 'Urban exit to open west Texas roads.' },
      { mile: 26.1, lat: 31.2613, lng: -100.8176, label: 'Mertzon', note: 'Crosswind and shallow grades.' },
      { mile: 55.8, lat: 31.1915, lng: -101.4604, label: 'Big Lake', note: 'Open road energy tracking.' },
      { mile: 73.6, lat: 31.2226, lng: -101.9379, label: 'Rankin', note: 'Remote-road convoy spacing.' },
      { mile: 88.4, lat: 31.1354, lng: -102.2243, label: 'McCamey', note: 'Wind exposure remains dominant.' },
      { mile: 112.8, lat: 30.8940, lng: -102.8793, label: 'Fort Stockton', note: 'Final arrival after extended open terrain.' },
    ],
    segments: [
      {
        mileStart: 0,
        mileEnd: 16.4,
        title: 'San Angelo exit',
        type: 'town',
        risk: 'medium',
        notes: 'Urban edge traffic transitions quickly to open road.',
        strategy: 'Complete communications checks before entering long low-service stretches.',
      },
      {
        mileStart: 16.4,
        mileEnd: 34.8,
        title: 'US 67 open crosswind',
        type: 'caution',
        risk: 'high',
        notes: 'Wind exposure begins early and may create steering and energy penalties.',
        strategy: 'Drive to stable power and body control, reducing speed during gust bands.',
      },
      {
        mileStart: 34.8,
        mileEnd: 51.3,
        title: 'Shallow grade plateau',
        type: 'flat',
        risk: 'medium',
        notes: 'Subtle grades can hide persistent consumption changes.',
        strategy: 'Use rolling Wh/mile averages to detect grade and wind shifts.',
      },
      {
        mileStart: 51.3,
        mileEnd: 68.6,
        title: 'Extended downhill run',
        type: 'descent',
        risk: 'medium',
        notes: 'Long downhill sections can deliver excellent efficiency if speed stays disciplined.',
        strategy: 'Let the route pay back energy through low-draw cruising and selective regen.',
      },
      {
        mileStart: 68.6,
        mileEnd: 82.5,
        title: 'US 385 transition',
        type: 'caution',
        risk: 'high',
        notes: 'Highway transition and remote-road spacing require careful convoy control.',
        strategy: 'Confirm turn procedures and keep chase vehicles visible without crowding.',
      },
      {
        mileStart: 82.5,
        mileEnd: 98.7,
        title: 'West Texas wind corridor',
        type: 'flat',
        risk: 'high',
        notes: 'Open landscape offers little shelter from crosswinds or headwinds.',
        strategy: 'Recalculate speed targets whenever wind direction changes materially.',
      },
      {
        mileStart: 98.7,
        mileEnd: 112.8,
        title: 'Fort Stockton approach',
        type: 'descent',
        risk: 'medium',
        notes: 'Final miles may trend favorable but still demand attention after a long exposed day.',
        strategy: 'Convert any downhill advantage into battery reserve instead of a late speed push.',
      },
      {
        mileStart: 89.2,
        mileEnd: 112.8,
        title: 'Mandatory trailering: Fort Stockton approach',
        type: 'mandatory_trailer',
        risk: 'low',
        notes: 'Official non-scoring transport section into the Fort Stockton finish area.',
        strategy: 'Battery preserved for the finish transport window; count clock time but not driven scoring miles.',
        scoringMiles: 0,
        transportMiles: 23.6,
        startLocationName: 'Fort Stockton approach westbound',
        endLocationName: 'Fort Stockton finish',
        routeCoordinates: [
          { lat: 30.95868, lng: -102.58176 },
          { lat: 30.90231, lng: -102.90306 },
        ],
      },
    ],
  },
]

export function getRaceDay(day: string | number) {
  return raceRoute.find((raceDay) => raceDay.day === Number(day))
}
