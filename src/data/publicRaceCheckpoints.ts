export type PublicRaceCheckpoint = {
  id: string
  name: string
  city: string
  day: number
  type: string
  lat: number
  lng: number
  shortDescription: string
  whyItMatters: string
  image: {
    src: string
    alt: string
    credit: string
    sourceUrl: string
  }
}

const imageCredit = 'Checkpoint image provided for RX2 public race tracker'
const imageSourceUrl = '#'

export const publicRaceCheckpoints: PublicRaceCheckpoint[] = [
  {
    id: 'fort-worth-start',
    name: 'Fort Worth Start',
    city: 'Fort Worth, TX',
    day: 1,
    type: 'Start line',
    lat: 33.03047,
    lng: -97.320738,
    shortDescription:
      'The public journey begins in the Fort Worth area, where teams gather, stage, and roll out onto the Cross-Texas route.',
    whyItMatters:
      'This is the first public moment of the race: final checks are complete, supporters can see the car depart, and every mile from here counts toward the west Texas finish.',
    image: {
      src: '/checkpoint-images/fort-worth-start.jpg',
      alt: 'Fort Worth start area for the Solar Car Challenge route',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'godley-high-school',
    name: 'Godley High School',
    city: 'Godley, TX',
    day: 1,
    type: 'School checkpoint',
    lat: 32.456855,
    lng: -97.546999,
    shortDescription:
      'A school-community stop south of Fort Worth as the route settles into its first day rhythm.',
    whyItMatters:
      'Early checkpoints help fans follow the field as teams move from launch excitement into steady road discipline and public outreach.',
    image: {
      src: '/checkpoint-images/godley-high-school.jpg',
      alt: 'Godley High School checkpoint on the public race route',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'hillsboro-courthouse',
    name: 'Hillsboro Courthouse',
    city: 'Hillsboro, TX',
    day: 1,
    type: 'Civic landmark',
    lat: 32.011275,
    lng: -97.130728,
    shortDescription:
      'A courthouse landmark that makes the first day easy for families and supporters to recognize on the map.',
    whyItMatters:
      'Landmark stops turn the route into a story fans can follow, connecting the car to real Texas towns instead of anonymous miles.',
    image: {
      src: '/checkpoint-images/hillsboro-courthouse.jpg',
      alt: 'Hill County Courthouse in Hillsboro, Texas',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'palestine-high-school',
    name: 'Palestine High School',
    city: 'Palestine, TX',
    day: 2,
    type: 'School checkpoint',
    lat: 31.738999,
    lng: -95.604293,
    shortDescription:
      'A public school stop in east Texas that anchors the route as the race moves into Day 2.',
    whyItMatters:
      'School checkpoints are where the race feels most connected to students, families, and the education mission behind solar racing.',
    image: {
      src: '/checkpoint-images/palestine-high-school.jpg',
      alt: 'Palestine High School checkpoint for RX2 fans',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'leon-isd',
    name: 'Leon ISD',
    city: 'Jewett, TX',
    day: 2,
    type: 'School checkpoint',
    lat: 31.318984,
    lng: -96.209238,
    shortDescription:
      'A rural school checkpoint between Palestine and central Texas, giving fans another clear place to track the team.',
    whyItMatters:
      'Stops like Leon ISD show how the race links smaller communities into a statewide STEM story.',
    image: {
      src: '/checkpoint-images/leon-isd.jpg',
      alt: 'Leon ISD public checkpoint on the solar race route',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'dell-diamond-round-rock',
    name: 'Dell Diamond / Round Rock',
    city: 'Round Rock, TX',
    day: 2,
    type: 'Public landmark',
    lat: 30.527732,
    lng: -97.630839,
    shortDescription:
      'A recognizable Round Rock landmark near the route as the race reaches the Austin metro area.',
    whyItMatters:
      'This checkpoint helps fans orient the team near a major population center before the route bends toward Hill Country.',
    image: {
      src: '/checkpoint-images/dell-diamond-round-rock.jpg',
      alt: 'Dell Diamond area in Round Rock, Texas',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'liberty-hill-high-school',
    name: 'Liberty Hill High School',
    city: 'Liberty Hill, TX',
    day: 3,
    type: 'School checkpoint',
    lat: 30.6649,
    lng: -97.9225,
    shortDescription:
      'A Hill Country school stop as the race leaves the Austin-area corridor and heads toward more open terrain.',
    whyItMatters:
      'For fans, this is a natural transition point: the route starts to feel less urban and more like the long-distance endurance challenge ahead.',
    image: {
      src: '/checkpoint-images/liberty-hill.jpg',
      alt: 'Liberty Hill checkpoint on the public race route',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'science-mill-johnson-city',
    name: 'Science Mill / Johnson City',
    city: 'Johnson City, TX',
    day: 3,
    type: 'STEM landmark',
    lat: 30.276445,
    lng: -98.412199,
    shortDescription:
      'A STEM-focused landmark in Johnson City, matching the educational heart of the Solar Car Challenge.',
    whyItMatters:
      'The Science Mill is the kind of stop that makes the race bigger than competition: it connects clean energy, engineering, and student imagination.',
    image: {
      src: '/checkpoint-images/science-mill-johnson-city.jpg',
      alt: 'Science Mill in Johnson City, Texas',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'fredericksburg-marktplatz',
    name: 'Fredericksburg Marktplatz',
    city: 'Fredericksburg, TX',
    day: 3,
    type: 'Town landmark',
    lat: 30.276277,
    lng: -98.872635,
    shortDescription:
      'A central Fredericksburg landmark that gives fans a clear Hill Country reference point.',
    whyItMatters:
      'By this point the race has become a true cross-state trek, and town-center landmarks make progress easy to understand at a glance.',
    image: {
      src: '/checkpoint-images/fredericksburg-marktplatz.jpg',
      alt: 'Fredericksburg Marktplatz landmark',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'mason-courthouse',
    name: 'Mason Courthouse',
    city: 'Mason, TX',
    day: 4,
    type: 'Civic landmark',
    lat: 30.74829,
    lng: -99.231933,
    shortDescription:
      'A courthouse landmark as the race moves deeper into central and west Texas.',
    whyItMatters:
      'Mason marks a clear public milestone where the route begins to feel more remote and endurance-focused.',
    image: {
      src: '/checkpoint-images/mason-courthouse.jpg',
      alt: 'Mason County Courthouse checkpoint',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'brady',
    name: 'Brady',
    city: 'Brady, TX',
    day: 4,
    type: 'Town checkpoint',
    lat: 31.135483,
    lng: -99.341013,
    shortDescription:
      'A central Texas town checkpoint that helps fans follow the team across longer rural stretches.',
    whyItMatters:
      'Brady is a useful storytelling marker between Hill Country and the wider west Texas approach.',
    image: {
      src: '/checkpoint-images/brady.jpg',
      alt: 'Brady, Texas checkpoint area',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'san-angelo',
    name: 'San Angelo',
    city: 'San Angelo, TX',
    day: 4,
    type: 'City checkpoint',
    lat: 31.487883,
    lng: -100.460775,
    shortDescription:
      'A major west Texas city checkpoint and one of the most recognizable stops late in the race.',
    whyItMatters:
      'San Angelo gives supporters a major progress marker before the course pushes toward the more exposed final run.',
    image: {
      src: '/checkpoint-images/san-angelo.jpg',
      alt: 'San Angelo checkpoint on the public race route',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'big-lake',
    name: 'Big Lake',
    city: 'Big Lake, TX',
    day: 5,
    type: 'Town checkpoint',
    lat: 31.192112,
    lng: -101.466821,
    shortDescription:
      'A west Texas town checkpoint on the long approach toward Fort Stockton.',
    whyItMatters:
      'Big Lake helps fans see the team entering the final day’s wide-open miles, where the landscape and distance become part of the story.',
    image: {
      src: '/checkpoint-images/big-lake.jpg',
      alt: 'Big Lake, Texas public checkpoint',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'mccamey',
    name: 'McCamey',
    city: 'McCamey, TX',
    day: 5,
    type: 'Town checkpoint',
    lat: 31.131541,
    lng: -102.222329,
    shortDescription:
      'A final-day checkpoint near the junctions and open roads leading toward Fort Stockton.',
    whyItMatters:
      'McCamey signals that RX2 is in the closing stretch of the public route, with the finish now within reach.',
    image: {
      src: '/checkpoint-images/mccamey.jpg',
      alt: 'McCamey, Texas checkpoint area',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
  {
    id: 'fort-stockton-finish',
    name: 'Fort Stockton Finish',
    city: 'Fort Stockton, TX',
    day: 5,
    type: 'Finish line',
    lat: 30.902088,
    lng: -102.902886,
    shortDescription:
      'The public finish destination after hundreds of miles across Texas.',
    whyItMatters:
      'Fort Stockton is the celebration point: the place where the team’s preparation, teamwork, and clean-energy engineering story reaches its finish.',
    image: {
      src: '/checkpoint-images/fort-stockton-finish.jpg',
      alt: 'Fort Stockton finish checkpoint for the Solar Car Challenge',
      credit: imageCredit,
      sourceUrl: imageSourceUrl,
    },
  },
]
