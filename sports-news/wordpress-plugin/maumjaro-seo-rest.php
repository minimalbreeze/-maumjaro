<?php
/**
 * Plugin Name: 맘운자로 SEO REST 열기
 * Description: Rank Math의 SEO 제목·설명·대표 키워드를 REST API로 저장할 수 있게 합니다. 자동화로 임시글을 만들 때 이 칸들이 함께 채워집니다.
 * Version:     1.0.0
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
 * - 여는 것은 아래 META_KEYS에 적힌 세 개뿐입니다.
 * - 글을 수정할 권한이 있는 사용자만 쓸 수 있습니다 (edit_post 확인).
 * - 값은 문자열로만 받고 저장 전에 정리합니다.
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

function maumjaro_seo_register_meta() {
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
