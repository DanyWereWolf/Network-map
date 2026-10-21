/**
 * Эмоции ассистента Волы (Volsmap).
 * Файлы: public/icons/assistant/vola-*.png
 */
(function (global) {
    var BASE = 'icons/assistant/';

    var FILES = {
        wave: 'vola-wave.png',
        smile: 'vola-smile.png',
        think: 'vola-think.png',
        cheer: 'vola-cheer.png',
        giggle: 'vola-giggle.png',
        surprise: 'vola-surprise.png',
        angry: 'vola-angry.png',
        nervous: 'vola-nervous.png',
        sad: 'vola-sad.png',
        shy: 'vola-shy.png',
        thumbs: 'vola-thumbs.png',
        glasses: 'vola-glasses.png',
        sparkle: 'vola-sparkle.png',
        panic: 'vola-panic.png',
        thanks: 'vola-thanks.png',
        question: 'vola-question.png'
    };

    var ALIASES = {
        default: 'wave',
        hello: 'wave',
        greet: 'wave',
        happy: 'smile',
        laugh: 'giggle',
        success: 'thumbs',
        celebrate: 'sparkle',
        go: 'cheer',
        help: 'glasses',
        docs: 'glasses',
        error: 'sad',
        fail: 'sad',
        warning: 'nervous',
        alert: 'surprise',
        critical: 'panic',
        thanks: 'thanks',
        gratitude: 'thanks',
        ask: 'question',
        complete: 'sparkle'
    };

    function resolveEmotion(emotion) {
        var key = emotion == null || emotion === '' ? 'default' : String(emotion);
        if (FILES[key]) return key;
        if (ALIASES[key] && FILES[ALIASES[key]]) return ALIASES[key];
        return 'wave';
    }

    function getSrc(emotion) {
        return BASE + FILES[resolveEmotion(emotion)];
    }

    function applyTo(img, emotion) {
        if (!img) return getSrc(emotion);
        img.src = getSrc(emotion);
        return img.src;
    }

    function imgHtml(emotion, className) {
        var cls = className ? ' class="' + String(className).replace(/"/g, '') + '"' : '';
        return '<img' + cls + ' src="' + getSrc(emotion) + '" alt="" aria-hidden="true" decoding="async">';
    }

    global.AssistantAvatars = {
        BASE: BASE,
        FILES: FILES,
        ALIASES: ALIASES,
        resolveEmotion: resolveEmotion,
        getSrc: getSrc,
        applyTo: applyTo,
        imgHtml: imgHtml
    };
})(typeof window !== 'undefined' ? window : this);
