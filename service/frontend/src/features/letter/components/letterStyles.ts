// 레터 화면 공용 스타일(styled-jsx 대신 문자열 <style>을 쓰는 이 코드베이스의 방식). 색은 사이트 톤(서울경제 파랑 #5b8def 계열, 부드러운 그림자, 넉넉한 여백).
import { BASE_CSS } from './styles/base';
import { LIST_CSS } from './styles/list';
import { DETAIL_CSS } from './styles/detail';
import { DIALOG_CSS } from './styles/dialog';
import { MOBILE_CSS } from './styles/mobile';
import { VOTE_CSS } from './styles/vote';

/** 레터 화면 전체 CSS. 영역별 파일을 원래 순서대로 이어 붙인다(순서가 곧 우선순위). */
export const LETTER_CSS = [BASE_CSS, LIST_CSS, DETAIL_CSS, DIALOG_CSS, MOBILE_CSS, VOTE_CSS].join('');
