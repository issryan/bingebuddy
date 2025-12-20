export type Show = {
  id: string;
  title: string;
  createdAt: number;
};

export type RankedShow = Show & {
  rating: number;
};