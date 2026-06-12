export type TeamMember = {
  id: string
  name: string
  subteam: 'Mechanical' | 'Electrical' | 'Operations'
  role: string
  imageSrc: string
  imageAlt: string
}

export const teamMembers: TeamMember[] = [
  {
    id: 'alexis-l',
    name: 'Alexis L.',
    subteam: 'Mechanical',
    role: 'Mechanical Lead/Captain',
    imageSrc: '/race-images/team-members/alexis-l.png',
    imageAlt: 'Alexis L. of Racer X2',
  },
  {
    id: 'elaine-z',
    name: 'Elaine Z.',
    subteam: 'Mechanical',
    role: 'Mechanical',
    imageSrc: '/race-images/team-members/elaine-z.png',
    imageAlt: 'Elaine Z. of Racer X2',
  },
  {
    id: 'leilany-g',
    name: 'Leilany G.',
    subteam: 'Mechanical',
    role: 'Mechanical',
    imageSrc: '/race-images/team-members/leilany-g.png',
    imageAlt: 'Leilany G. of Racer X2',
  },
  {
    id: 'keilah-m',
    name: 'Keilah M.',
    subteam: 'Mechanical',
    role: 'Mechanical',
    imageSrc: '/race-images/team-members/keilah-m.png',
    imageAlt: 'Keilah M. of Racer X2',
  },
  {
    id: 'miranda-t',
    name: 'Miranda T.',
    subteam: 'Mechanical',
    role: 'Mechanical',
    imageSrc: '/race-images/team-members/miranda-t.png',
    imageAlt: 'Miranda T. of Racer X2',
  },
  {
    id: 'winter-w',
    name: 'Winter W.',
    subteam: 'Electrical',
    role: 'Electrical Lead',
    imageSrc: '/race-images/team-members/winter-w.png',
    imageAlt: 'Winter W. of Racer X2',
  },
  {
    id: 'taylor-l',
    name: 'Taylor L.',
    subteam: 'Electrical',
    role: 'Electrical',
    imageSrc: '/race-images/team-members/taylor-l.png',
    imageAlt: 'Taylor L. of Racer X2',
  },
  {
    id: 'isabella-t',
    name: 'Isabella T.',
    subteam: 'Electrical',
    role: 'Electrical',
    imageSrc: '/race-images/team-members/isabella-t.png',
    imageAlt: 'Isabella T. of Racer X2',
  },
  {
    id: 'amelia-l',
    name: 'Amelia L.',
    subteam: 'Electrical',
    role: 'Electrical',
    imageSrc: '/race-images/team-members/amelia-l.png',
    imageAlt: 'Amelia L. of Racer X2',
  },
  {
    id: 'julie-l',
    name: 'Julie L.',
    subteam: 'Operations',
    role: 'Operations Lead/Project Manager',
    imageSrc: '/race-images/team-members/julie-l.png',
    imageAlt: 'Julie L. of Racer X2',
  },
  {
    id: 'sharleen-c',
    name: 'Sharleen C.',
    subteam: 'Operations',
    role: 'Operations',
    imageSrc: '/race-images/team-members/sharleen-c.png',
    imageAlt: 'Sharleen C. of Racer X2',
  },
  {
    id: 'skye-z',
    name: 'Skye Z.',
    subteam: 'Operations',
    role: 'Operations',
    imageSrc: '/race-images/team-members/skye-z.png',
    imageAlt: 'Skye Z. of Racer X2',
  },
  {
    id: 'ellie-l',
    name: 'Ellie L.',
    subteam: 'Operations',
    role: 'Operations',
    imageSrc: '/race-images/team-members/ellie-l.png',
    imageAlt: 'Ellie L. of Racer X2',
  },
  {
    id: 'carrie-c',
    name: 'Carrie C.',
    subteam: 'Operations',
    role: 'Operations',
    imageSrc: '/race-images/team-members/carrie-c.png',
    imageAlt: 'Carrie C. of Racer X2',
  },
]

export function findTeamMemberById(id?: string) {
  if (!id) return null

  return teamMembers.find((member) => member.id === id) ?? null
}
