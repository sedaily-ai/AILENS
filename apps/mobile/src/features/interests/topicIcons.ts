import type { ComponentType } from 'react';
// 관심 주제 칩 앞의 아이콘 — Phosphor(MIT) 선 아이콘 한 세트로 통일한다(플랫폼 이모지는 기기마다 모양이 달라 어색해서 쓰지 않는다).
// 주제 이름 → 아이콘, 없으면 소속 분야 아이콘. 쓰는 것만 개별 import 해서 번들을 키우지 않는다.
import { ChartLineUp } from 'phosphor-react-native/src/icons/ChartLineUp';
import { House } from 'phosphor-react-native/src/icons/House';
import { ChartBar } from 'phosphor-react-native/src/icons/ChartBar';
import { Bank } from 'phosphor-react-native/src/icons/Bank';
import { Factory } from 'phosphor-react-native/src/icons/Factory';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { UsersThree } from 'phosphor-react-native/src/icons/UsersThree';
import { Globe } from 'phosphor-react-native/src/icons/Globe';
import { FilmSlate } from 'phosphor-react-native/src/icons/FilmSlate';
import { Sparkle } from 'phosphor-react-native/src/icons/Sparkle';
import { CurrencyKrw } from 'phosphor-react-native/src/icons/CurrencyKrw';
import { Coins } from 'phosphor-react-native/src/icons/Coins';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { ShoppingCart } from 'phosphor-react-native/src/icons/ShoppingCart';
import { Lightning } from 'phosphor-react-native/src/icons/Lightning';
import { Briefcase } from 'phosphor-react-native/src/icons/Briefcase';
import { Truck } from 'phosphor-react-native/src/icons/Truck';
import { Cpu } from 'phosphor-react-native/src/icons/Cpu';
import { BatteryFull } from 'phosphor-react-native/src/icons/BatteryFull';
import { Car } from 'phosphor-react-native/src/icons/Car';
import { Robot } from 'phosphor-react-native/src/icons/Robot';
import { DeviceMobile } from 'phosphor-react-native/src/icons/DeviceMobile';
import { Dna } from 'phosphor-react-native/src/icons/Dna';
import { Package } from 'phosphor-react-native/src/icons/Package';
import { ForkKnife } from 'phosphor-react-native/src/icons/ForkKnife';
import { Fish } from 'phosphor-react-native/src/icons/Fish';
import { Rocket } from 'phosphor-react-native/src/icons/Rocket';
import { Lightbulb } from 'phosphor-react-native/src/icons/Lightbulb';
import { Flag } from 'phosphor-react-native/src/icons/Flag';
import { Scales } from 'phosphor-react-native/src/icons/Scales';
import { Scroll } from 'phosphor-react-native/src/icons/Scroll';
import { Handshake } from 'phosphor-react-native/src/icons/Handshake';
import { Key } from 'phosphor-react-native/src/icons/Key';
import { PencilLine } from 'phosphor-react-native/src/icons/PencilLine';
import { Storefront } from 'phosphor-react-native/src/icons/Storefront';
import { GraduationCap } from 'phosphor-react-native/src/icons/GraduationCap';
import { Baby } from 'phosphor-react-native/src/icons/Baby';
import { Warning } from 'phosphor-react-native/src/icons/Warning';
import { Leaf } from 'phosphor-react-native/src/icons/Leaf';
import { Users } from 'phosphor-react-native/src/icons/Users';
import { Heartbeat } from 'phosphor-react-native/src/icons/Heartbeat';
import { Airplane } from 'phosphor-react-native/src/icons/Airplane';
import { Train } from 'phosphor-react-native/src/icons/Train';
import { PiggyBank } from 'phosphor-react-native/src/icons/PiggyBank';
import { CreditCard } from 'phosphor-react-native/src/icons/CreditCard';
import { ShieldCheck } from 'phosphor-react-native/src/icons/ShieldCheck';
import { Percent } from 'phosphor-react-native/src/icons/Percent';
import { TrendUp } from 'phosphor-react-native/src/icons/TrendUp';
import { Gavel } from 'phosphor-react-native/src/icons/Gavel';
import { Flame } from 'phosphor-react-native/src/icons/Flame';
import { Ticket } from 'phosphor-react-native/src/icons/Ticket';
import { ClipboardText } from 'phosphor-react-native/src/icons/ClipboardText';
import { Basket } from 'phosphor-react-native/src/icons/Basket';
import { Money } from 'phosphor-react-native/src/icons/Money';
import { Wallet } from 'phosphor-react-native/src/icons/Wallet';
import { Planet } from 'phosphor-react-native/src/icons/Planet';
import { MapPin } from 'phosphor-react-native/src/icons/MapPin';
import { Compass } from 'phosphor-react-native/src/icons/Compass';
import { BookOpen } from 'phosphor-react-native/src/icons/BookOpen';
import { Hammer } from 'phosphor-react-native/src/icons/Hammer';
import { Student } from 'phosphor-react-native/src/icons/Student';
import { Pulse } from 'phosphor-react-native/src/icons/Pulse';
import { Siren } from 'phosphor-react-native/src/icons/Siren';
import { Coffee } from 'phosphor-react-native/src/icons/Coffee';
import { Wine } from 'phosphor-react-native/src/icons/Wine';
import { Camera } from 'phosphor-react-native/src/icons/Camera';
import { FilmReel } from 'phosphor-react-native/src/icons/FilmReel';
import { MusicNotes } from 'phosphor-react-native/src/icons/MusicNotes';
import { Books } from 'phosphor-react-native/src/icons/Books';
import { Tag } from 'phosphor-react-native/src/icons/Tag';
import { Stack } from 'phosphor-react-native/src/icons/Stack';
import { Bag } from 'phosphor-react-native/src/icons/Bag';
import { Anchor } from 'phosphor-react-native/src/icons/Anchor';
import { Medal } from 'phosphor-react-native/src/icons/Medal';
import { Eyeglasses } from 'phosphor-react-native/src/icons/Eyeglasses';
import { Tree } from 'phosphor-react-native/src/icons/Tree';
import { Bed } from 'phosphor-react-native/src/icons/Bed';
import { Hospital } from 'phosphor-react-native/src/icons/Hospital';
import { Wrench } from 'phosphor-react-native/src/icons/Wrench';

export type TopicIcon = ComponentType<{ size?: number; color?: string; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;

const CATEGORY: Record<string, TopicIcon> = {
  markets: ChartLineUp,
  property: House,
  economy: ChartBar,
  finance: Bank,
  industry: Factory,
  politics: Scales,
  national: UsersThree,
  international: Globe,
  culture: FilmSlate,
  etc: Sparkle,
};

const BY_LABEL: Record<string, TopicIcon> = {
  '금리': Percent,
  '대출': CreditCard,
  '보험': ShieldCheck,
  '연금': PiggyBank,
  '은행': Bank,
  '환율': CurrencyKrw,
  '가상자산': Coins,
  '카드': CreditCard,
  '물가': ShoppingCart,
  '세금': Receipt,
  '소비': Bag,
  '재정': Wallet,
  '에너지': Lightning,
  '고용': Briefcase,
  '최저임금': Money,
  '경제성장률': TrendUp,
  '세금·재정': Receipt,
  '경제분석': ChartBar,
  '통상': Package,
  '기후에너지': Leaf,
  '반도체': Cpu,
  '배터리': BatteryFull,
  '자동차': Car,
  '인공지능': Robot,
  '플랫폼': DeviceMobile,
  '바이오': Dna,
  '유통': Package,
  '유통·생활': Basket,
  '외식업': ForkKnife,
  '해양·수산': Fish,
  '대기업': Buildings,
  '중기·IT': Stack,
  '기업인': Briefcase,
  '투자·재무': Money,
  '건설업계': Hammer,
  '스타트업': Rocket,
  '벤처투자': Lightbulb,
  'K뷰티': Sparkle,
  '아모레퍼시픽': Sparkle,
  '삼성전자': DeviceMobile,
  'SK하이닉스': Cpu,
  '코스피': ChartLineUp,
  '국내증시': ChartLineUp,
  '해외증시': Globe,
  'IB&Deal': Handshake,
  '펀드·채권': ClipboardText,
  'ETF': Stack,
  '공모주·IPO': Ticket,
  '배당': Coins,
  '테마주': Flame,
  '기업 실적': ClipboardText,
  '글로벌 리밸런싱': Scales,
  '전세': Key,
  '청약': PencilLine,
  '임대료': Storefront,
  '부동산 시장': House,
  '부동산일반': House,
  '젠트리피케이션': Buildings,
  '경매': Gavel,
  '상권': Storefront,
  '성수동': MapPin,
  '익선동': MapPin,
  '종로3가': MapPin,
  '미국': Flag,
  '중국': Flag,
  '일본': Flag,
  '유럽': Flag,
  '인도': Flag,
  '중동': Flag,
  '필리핀': Flag,
  '관세': Package,
  '연준': Bank,
  '무역·통상': Truck,
  '미국·중남미': Globe,
  '일본·중국': Globe,
  '국회': Scales,
  '규제': Scroll,
  '선거': Flag,
  '외교·안보': ShieldCheck,
  '통일·외교·안보': ShieldCheck,
  '청와대': Buildings,
  '교육': GraduationCap,
  '노동': Wrench,
  '고령화': Users,
  '저출생': Baby,
  '안전·재난': Siren,
  '환경·기후': Leaf,
  '가짜뉴스': Eyeglasses,
  '지방자치': MapPin,
  '법조': Gavel,
  '노동·고용': Wrench,
  '한옥': House,
  '도시·동네': MapPin,
  '여행·관광': Airplane,
  '음식·맛집': ForkKnife,
  '콘텐츠': FilmReel,
  '전시·공연': Medal,
  '영화·미디어': FilmReel,
  '출판': Books,
  '여행·레저': Airplane,
};

export const categoryIcon = (slug?: string | null): TopicIcon => (slug && CATEGORY[slug]) || CATEGORY.etc;
export const topicIcon = (label: string, cat?: string | null): TopicIcon => BY_LABEL[label] ?? categoryIcon(cat);
