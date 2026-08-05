import type { MbtiGroupId } from "@/shared/data/mbtiGroups";

export interface MbtiVersion {
  title: string;
  subtitle: string;
  body: string | string[];
  key_points: string[];
  closing_line: string;
  tone: string;
  image_url?: string;
}

export interface MbtiArticle {
  news_id: string;
  title: string;
  sub_title: string;
  published_at: string;
  category: string;
  provider: string;
  byline: string;
  image_url: string | null;
  content: string;
  original_link: string;
  versions?: Record<string, MbtiVersion>;
}

export interface ArchivedSentence {
  id: string;
  text: string;
  articleId: string;
  articleTitle: string;
  articlePublishedAt?: string;
  createdAt: Date;
}

export interface TextSelection {
  text: string;
  articleId: string;
  articleTitle: string;
  articlePublishedAt?: string;
  position: { x: number; y: number };
}

export interface Persona {
  name: string;
  style: string;
  color: string;
}

// MBTI 페르소나 정보
export const personaInfo: Record<MbtiGroupId, Persona> = {
  NT: { name: "분석가", style: "데이터와 논리로 본질을 꿰뚫어요", color: "bg-blue-500" },
  NF: { name: "이야기꾼", style: "사람과 감정의 결을 읽어내요", color: "bg-purple-500" },
  ST: { name: "실용가", style: "핵심만 쏙쏙, 바로 써먹을 수 있게", color: "bg-green-500" },
  SF: { name: "친구", style: "편하게 수다 떨듯 알려드려요", color: "bg-orange-500" },
};

export type TabType = "question" | "feed" | "community" | "archive" | "dna";
export type DnaSubTab = "analysis" | "birthday";
export type DnaViewMode = "radar" | "chart";
