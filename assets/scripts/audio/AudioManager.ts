import { _decorator, Component, AudioSource, AudioClip } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 音频事件名（命名约定：event:/[Category]/[Name] 的简化版，纯字符串键）
 *
 * 游戏代码一律通过 AudioManager.inst.play(AudioEvent.XXX) 触发，
 * 不直接持有任何 AudioClip 路径 —— 资源由 Inspector 注入，替换音效无需改代码。
 * 这正是「中间件事件系统」在 Cocos 原生下的落地方式（FMOD/Wwise 是更强的同类方案）。
 */
export enum AudioEvent {
    SELECT = 'select',        // 选中方块（第一次点击）
    SWAP = 'swap',            // 交换动作（第二次相邻点击）
    MATCH = 'match',          // 普通消除
    BIG_MATCH = 'big_match',  // 大连消 / 连锁（死亡方块数较多时）
    INVALID = 'invalid',      // 无法消除，回弹
    SHUFFLE = 'shuffle',      // 死局重开 / 洗牌
    MUSIC_BG = 'music_bg',    // 背景循环乐
}

/** play() 的可选参数：音量微调、音高升级（combo 用） */
export interface PlayOptions {
    volume?: number;  // 0-1，叠加在主音量之上
    rate?: number;    // 播放速率（1=原速，>1 升调，用于 combo 升级）
}

/**
 * AudioManager —— 全局音频总管（单例组件）
 *
 * 职责（全部遵循「游戏代码不直接播声音」的原则）：
 *  - 维护「事件名 → AudioClip」映射（clip 由 Inspector 注入，不写死路径）
 *  - SFX 用声音池播放，受 maxVoices 预算约束（超额则回收最旧的声音，避免低端机卡顿）
 *  - 背景乐用独立循环 AudioSource
 *  - 提供主音量 / 静音开关
 *
 * 挂载方式：在场景中建一个空节点（如命名为 AudioManager），挂本组件，
 * 在 Inspector 里把各 AudioClip 拖进去，并把背景乐拖到 bgClip。
 */
@ccclass('AudioManager')
export class AudioManager extends Component {
    // ===== SFX 资源（Inspector 注入）=====
    @property(AudioClip) selectClip: AudioClip = null;
    @property(AudioClip) swapClip: AudioClip = null;
    @property(AudioClip) matchClip: AudioClip = null;
    @property(AudioClip) bigMatchClip: AudioClip = null;
    @property(AudioClip) invalidClip: AudioClip = null;
    @property(AudioClip) shuffleClip: AudioClip = null;
    // ===== 音乐资源 =====
    @property(AudioClip) bgClip: AudioClip = null;

    @property({ tooltip: '最大同时播放的 SFX 声音数（声音预算，防止低端机卡顿）' }) maxVoices = 12;
    @property({ tooltip: '主音量 0-1' }) masterVolume = 1.0;
    @property({ tooltip: '背景乐相对主音量的比例（通常低于 SFX）' }) musicVolume = 0.5;

    /** 全局唯一实例，供任意组件访问 */
    static inst: AudioManager = null;

    private musicSource: AudioSource = null;       // 背景乐专用
    private sfxPool: AudioSource[] = [];            // SFX 声音池
    private clipMap: Map<string, AudioClip> = new Map();
    private isMuted: boolean = false;

    onLoad() {
        AudioManager.inst = this;

        // 背景乐源：常驻、循环
        this.musicSource = this.node.addComponent(AudioSource);
        this.musicSource.loop = true;

        // 建立事件名 → 片段 映射
        this.clipMap.set(AudioEvent.SELECT, this.selectClip);
        this.clipMap.set(AudioEvent.SWAP, this.swapClip);
        this.clipMap.set(AudioEvent.MATCH, this.matchClip);
        this.clipMap.set(AudioEvent.BIG_MATCH, this.bigMatchClip);
        this.clipMap.set(AudioEvent.INVALID, this.invalidClip);
        this.clipMap.set(AudioEvent.SHUFFLE, this.shuffleClip);
        this.clipMap.set(AudioEvent.MUSIC_BG, this.bgClip);
    }

    onDestroy() {
        if (AudioManager.inst === this) AudioManager.inst = null;
    }

    /**
     * 播放一个命名音效。游戏代码只传事件名，不感知具体资源。
     * @param event  见 AudioEvent
     * @param opts   volume（叠加主音量）、rate（音高升级，combo 用）
     */
    play(event: AudioEvent, opts: PlayOptions = {}): void {
        const clip = this.clipMap.get(event);
        if (!clip) {
            console.warn(`[AudioManager] 事件 ${event} 未绑定音频资源`);
            return;
        }
        const src = this.acquireVoice();
        if (!src) return;                            // 预算已满且无可回收，丢弃本条
        src.clip = clip;
        src.loop = false;
        // src.playbackRate = opts.rate && opts.rate > 0 ? opts.rate : 1;
        src.volume = (opts.volume ?? 1) * this.masterVolume * (this.isMuted ? 0 : 1);
        src.currentTime = 0;
        src.play();
    }

    /** 从声音池取一个可用声源：优先空闲 → 未满则新建 → 超额回收最旧的 */
    private acquireVoice(): AudioSource {
        for (const s of this.sfxPool) {
            if (!s.playing) return s;
        }
        if (this.sfxPool.length < this.maxVoices) {
            const s = this.node.addComponent(AudioSource);
            this.sfxPool.push(s);
            return s;
        }
        // 超出预算：回收池中最旧的一个（简单贪心策略，保证总声音数受控）
        return this.sfxPool[0];
    }

    /** 启动背景循环乐 */
    startMusic(): void {
        if (!this.bgClip) return;
        this.musicSource.clip = this.bgClip;
        this.musicSource.volume = this.musicVolume * this.masterVolume * (this.isMuted ? 0 : 1);
        this.musicSource.play();
    }

    stopMusic(): void {
        this.musicSource.stop();
    }

    /** 设置主音量（0-1） */
    setVolume(v: number): void {
        this.masterVolume = Math.max(0, Math.min(1, v));
        this.applyMusicVolume();
    }

    /** 静音 / 取消静音。返回当前是否静音 */
    toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        this.applyMusicVolume();
        return this.isMuted;
    }

    private applyMusicVolume(): void {
        if (this.musicSource) {
            this.musicSource.volume = this.musicVolume * this.masterVolume * (this.isMuted ? 0 : 1);
        }
    }
}
