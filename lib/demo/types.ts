export type DemoService = {
  name: string;
  summary: string;
  priceFrom: string;
};

export type DemoReview = {
  name: string;
  relativeTime: string;
  stars: number;
  text: string;
};

export type DemoPost = {
  title: string;
  excerpt: string;
};

export type DemoFaq = {
  question: string;
  answer: string;
};

export type DemoGalleryVariant = "before" | "after" | "room" | "detail";

export type DemoGalleryItem = {
  title: string;
  caption: string;
  variant: DemoGalleryVariant;
};

export type DemoConfig = {
  slug: string;
  clinicName: string;
  city: string;
  categoryLabel: string;
  heroLede: string;
  metaDescription: string;
  services: readonly DemoService[];
  gallery: readonly DemoGalleryItem[];
  doctor: {
    name: string;
    role: string;
    bio: string;
    initials: string;
  };
  reviews: readonly DemoReview[];
  addressLines: readonly string[];
  hours: readonly { days: string; hours: string }[];
  faqs: readonly DemoFaq[];
  posts: readonly DemoPost[];
  /** Torio sales chat. The footer uses this URL with no extra query. */
  salesWhatsapp: string;
  ctaLabel: string;
};
