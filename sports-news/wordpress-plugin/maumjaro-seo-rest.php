<?php
/**
 * Plugin Name: 맘운자로 SEO REST 열기
 * Description: Rank Math의 SEO 제목·설명·대표 키워드를 REST API로 저장하고, 구글에만 색인 제외를 거는 칸을 엽니다. 자동화로 임시글을 만들 때 이 칸들이 함께 채워집니다.
 * Version:     1.2.0
 * Author:      minimalbreeze
 * License:     GPL-2.0-or-later
 *
 * 왜 이 플러그인이 필요한가
 * ------------------------
 * 워드프레스 REST API는 register_post_meta로 등록된 meta만 저장을 허용합니다.
 * Rank Math는 자기 칸을 REST에 열어두지 않기 때문에, 밖에서 글을 만들면
 * 본문·카테고리·태그는 들어가지만 SEO 제목·설명·대표 키워드 칸은 비어 있게
 * 됩니다. 이 플러그인은 그 세 칸만 REST에 엽니다.
 *
 * 안전장치
 * --------
 * - 여는 것은 아래 META_KEYS와 maumjaro_google_noindex 뿐입니다.
 * - 글을 수정할 권한이 있는 사용자만 쓸 수 있습니다 (edit_post 확인).
 * - 값은 문자열로만 받고 저장 전에 정리합니다.
 *
 * 1.2.0에서 더한 것 — 구글에만 색인 제외 (maumjaro_google_noindex)
 * ----------------------------------------------------------
 * 2026-10-09 서치콘솔: 발행 633편 중 색인 8편. "크롤링됨 - 현재 색인이 생성되지
 * 않음"이 148건이고, 끝난 대회의 중계 안내 글이 356편(56%)입니다. 이런 글을
 * 색인 대상에서 빼서 사이트 평균 품질을 올리려 합니다.
 *
 * **그런데 네이버에서는 색인이 잘 되고 있습니다.** 그래서 일반적인
 * <meta name="robots" content="noindex"> 를 쓰면 안 됩니다. 그건 모든
 * 검색엔진에게 하는 말이라 네이버 유입까지 끊깁니다.
 *
 * 대신 구글에게만 말합니다.
 *
 *     <meta name="googlebot" content="noindex">
 *
 * 메타 로봇 지시는 자기 이름이 적힌 것과 'robots'(전체)만 따르는 것이 규칙이라,
 * 다른 크롤러는 이 줄을 자기 것으로 보지 않습니다. 무엇보다 **이 플러그인은
 * name="robots" 줄을 아예 만들지 않습니다** — 네이버에게 하는 말이 페이지에
 * 없으면, 네이버가 무엇을 따르든 영향이 없습니다.
 *
 * Rank Math 의 robots 칸은 건드리지 않습니다. 그 칸은 name="robots" 를 만들고,
 * 저장 구조(PHP 직렬화 배열)도 공개 문서가 확정해 주지 않습니다. 우리가 만든
 * 칸 하나만 쓰면 둘 다 피할 수 있습니다.
 *
 * 값을 지우면(빈 문자열) 메타 줄이 사라지고 원래대로 돌아갑니다.
 */

if (!defined('ABSPATH')) {
    exit;
}

const MAUMJARO_SEO_META_KEYS = array(
    'rank_math_title',
    'rank_math_description',
    'rank_math_focus_keyword',
);

/**
 * 이 meta를 쓸 수 있는 사람인지 확인한다.
 *
 * $post_id가 오면 그 글에 대한 권한을 본다. 새 글을 만드는 중이라 아직
 * ID가 없으면 글 작성 권한으로 판단한다.
 */
function maumjaro_seo_can_edit($allowed, $meta_key, $post_id) {
    unset($allowed, $meta_key);

    if ($post_id) {
        return current_user_can('edit_post', $post_id);
    }

    return current_user_can('edit_posts');
}

/**
 * 구글에만 색인 제외를 거는 칸.
 *
 * 값이 '1'이면 그 글의 <head>에 <meta name="googlebot" content="noindex"> 가
 * 나갑니다. 그 밖의 값은 저장하지 않습니다 — 오타 하나로 색인이 꼬이지 않게.
 *
 * name="robots" 는 만들지 않습니다. 네이버를 비롯한 다른 검색엔진에게는
 * 아무 말도 하지 않습니다.
 */
const MAUMJARO_GOOGLE_NOINDEX_KEY = 'maumjaro_google_noindex';

function maumjaro_seo_clean_flag($value) {
    return ($value === '1' || $value === 1 || $value === true) ? '1' : '';
}

/** 깃발이 선 글에만 구글 전용 색인 제외를 찍는다. */
function maumjaro_seo_print_google_noindex() {
    if (!is_singular('post')) {
        return;
    }
    if (get_post_meta(get_the_ID(), MAUMJARO_GOOGLE_NOINDEX_KEY, true) !== '1') {
        return;
    }
    echo '<meta name="googlebot" content="noindex">' . "\n";
}
add_action('wp_head', 'maumjaro_seo_print_google_noindex', 1);

function maumjaro_seo_register_meta() {
    register_post_meta('post', MAUMJARO_GOOGLE_NOINDEX_KEY, array(
        'type'              => 'string',
        'single'            => true,
        'show_in_rest'      => true,
        'sanitize_callback' => 'maumjaro_seo_clean_flag',
        'auth_callback'     => 'maumjaro_seo_can_edit',
    ));

    foreach (MAUMJARO_SEO_META_KEYS as $key) {
        register_post_meta('post', $key, array(
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => true,
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => 'maumjaro_seo_can_edit',
        ));
    }
}
add_action('init', 'maumjaro_seo_register_meta');
