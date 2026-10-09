<?php
/**
 * Plugin Name: 맘운자로 SEO REST 열기
 * Description: Rank Math의 SEO 제목·설명·대표 키워드와 색인 설정(robots)을 REST API로 읽고 저장할 수 있게 합니다. 자동화로 임시글을 만들 때 이 칸들이 함께 채워집니다.
 * Version:     1.1.0
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
 * - 여는 것은 아래 META_KEYS와 rank_math_robots 뿐입니다.
 * - 글을 수정할 권한이 있는 사용자만 쓸 수 있습니다 (edit_post 확인).
 * - 값은 문자열로만 받고 저장 전에 정리합니다.
 *
 * 1.1.0에서 더한 것 — rank_math_robots (색인 설정)
 * --------------------------------------------
 * 2026-10-09 서치콘솔: 발행 633편 중 색인 8편. "크롤링됨 - 현재 색인이 생성되지
 * 않음"이 148건이고, 발행 글의 91%가 3,000자 미만입니다. 끝난 대회의 중계 안내
 * 같은 글을 색인 대상에서 빼서 사이트 평균 품질을 올리려면 이 칸이 필요합니다.
 *
 * 이 칸은 다른 셋과 달리 **문자열이 아니라 배열**입니다. Rank Math는 여기에
 * 'noindex', 'nofollow' 같은 값을 여러 개 담아 PHP 직렬화해 저장합니다.
 * 그래서 type을 array로 등록하고 안에 들어갈 값도 문자열로 못박습니다.
 * 워드프레스가 직렬화를 알아서 합니다 — 우리가 직렬화 문자열을 만들지 않습니다.
 *
 * 값을 지우면(빈 배열) Rank Math의 기본 설정이 적용됩니다.
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
 * 색인 설정(robots) 칸.
 *
 * 문자열 셋과 등록 방식이 달라서 따로 둡니다. 배열이고, 안에 들어갈 값도
 * 문자열로 못박습니다. 아는 지시어만 받습니다 — 오타로 엉뚱한 값이 들어가
 * 색인이 통째로 꼬이는 일을 막습니다.
 */
const MAUMJARO_SEO_ROBOTS_KEY = 'rank_math_robots';
const MAUMJARO_SEO_ROBOTS_ALLOWED = array(
    'index', 'noindex', 'nofollow', 'noarchive', 'noimageindex', 'nosnippet',
);

function maumjaro_seo_clean_robots($value) {
    if (!is_array($value)) {
        return array();
    }
    $out = array();
    foreach ($value as $one) {
        $one = sanitize_text_field((string) $one);
        if (in_array($one, MAUMJARO_SEO_ROBOTS_ALLOWED, true) && !in_array($one, $out, true)) {
            $out[] = $one;
        }
    }
    return $out;
}

function maumjaro_seo_register_meta() {
    register_post_meta('post', MAUMJARO_SEO_ROBOTS_KEY, array(
        'type'              => 'array',
        'single'            => true,
        'show_in_rest'      => array(
            'schema' => array(
                'type'  => 'array',
                'items' => array('type' => 'string'),
            ),
        ),
        'sanitize_callback' => 'maumjaro_seo_clean_robots',
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
