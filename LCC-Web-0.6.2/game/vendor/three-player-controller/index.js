// src/PlayerController.ts
import * as THREE26 from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// src/utils/MobileControls.ts
var iconLabels = {
  jump: "JUMP",
  brake: "BRAKE",
  fly: "FLY",
  view: "VIEW",
  vehicle: "CAR"
};
var VirtualJoystick = class {
  constructor(zone, size, onMove, onEnd) {
    this.pointerId = null;
    this.center = { x: 0, y: 0 };
    this.onPointerDown = (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      const rect = this.baseEl.parentElement.getBoundingClientRect();
      this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.baseEl.parentElement.setPointerCapture(e.pointerId);
      e.preventDefault();
      this.updateStick(e.clientX, e.clientY);
    };
    this.onPointerMove = (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.updateStick(e.clientX, e.clientY);
    };
    this.onPointerUp = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.stickEl.style.transform = "translate(-50%, -50%)";
      this.onEnd();
    };
    this.radius = size / 2;
    this.onMove = onMove;
    this.onEnd = onEnd;
    this.baseEl = document.createElement("div");
    Object.assign(this.baseEl.style, {
      position: "absolute",
      left: "50%",
      bottom: "50%",
      transform: "translate(-50%, 50%)",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      border: "2px solid rgba(0,0,0,0.5)",
      backgroundColor: "rgba(0,0,0,0.2)",
      boxSizing: "border-box",
      pointerEvents: "none"
    });
    zone.appendChild(this.baseEl);
    const stickSize = size * 0.2;
    this.stickEl = document.createElement("div");
    Object.assign(this.stickEl.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `${stickSize}px`,
      height: `${stickSize}px`,
      borderRadius: "50%",
      backgroundColor: "rgba(255,255,255,0.7)",
      pointerEvents: "none"
    });
    this.baseEl.appendChild(this.stickEl);
    zone.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    zone.addEventListener("pointermove", this.onPointerMove, { passive: false });
    zone.addEventListener("pointerup", this.onPointerUp, { passive: false });
    zone.addEventListener("pointercancel", this.onPointerUp, { passive: false });
  }
  updateStick(clientX, clientY) {
    const dx = clientX - this.center.x;
    const dy = clientY - this.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, this.radius);
    const angle = Math.atan2(dy, dx);
    const ox = Math.cos(angle) * clampedDist;
    const oy = Math.sin(angle) * clampedDist;
    this.stickEl.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    const scale = dist > 0 ? clampedDist / this.radius / dist : 0;
    this.onMove({ vector: { x: dx * scale, y: -dy * scale }, distance: clampedDist });
  }
  destroy() {
    const zone = this.baseEl.parentElement;
    if (zone) {
      zone.removeEventListener("pointerdown", this.onPointerDown);
      zone.removeEventListener("pointermove", this.onPointerMove);
      zone.removeEventListener("pointerup", this.onPointerUp);
      zone.removeEventListener("pointercancel", this.onPointerUp);
    }
    this.baseEl.remove();
  }
};
var MobileControls = class {
  constructor(setInput, controls) {
    this.options = {};
    // 摇杆状态
    this.joystick = null;
    this.prevJoyState = { moveX: 0, moveY: 0, shift: false };
    // DOM 元素
    this.joystickZoneEl = null;
    this.lookAreaEl = null;
    this.jumpBtnEl = null;
    this.flyBtnEl = null;
    this.viewBtnEl = null;
    this.vehicleBtnEl = null;
    // 触摸状态
    this.lookPointerId = null;
    this.isLookDown = false;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    // 触摸按下
    this.onPointerDown = (e) => {
      if (e.pointerType !== "touch") return;
      this.isLookDown = true;
      this.lookPointerId = e.pointerId;
      this.lastTouchX = e.clientX;
      this.lastTouchY = e.clientY;
      this.lookAreaEl?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    // 触摸移动
    this.onPointerMove = (e) => {
      if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
      const dx = e.clientX - this.lastTouchX;
      const dy = e.clientY - this.lastTouchY;
      this.lastTouchX = e.clientX;
      this.lastTouchY = e.clientY;
      this.setInput({ lookDeltaX: dx, lookDeltaY: dy });
      e.preventDefault();
    };
    // 触摸抬起
    this.onPointerUp = (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.isLookDown = false;
      this.lookPointerId = null;
      this.lookAreaEl?.releasePointerCapture?.(e.pointerId);
    };
    this.setInput = setInput;
    this.controls = controls;
  }
  // 初始化移动端控制
  async init(opts = {}) {
    this.options = opts;
    const showJoystick = opts.joystick ?? true;
    const showJump = opts.jump !== false;
    const showFly = opts.fly !== false;
    const showView = opts.view !== false;
    const showVehicle = opts.vehicle !== false;
    this.controls.maxPolarAngle = Math.PI * (300 / 360);
    this.controls.touches = { ONE: null, TWO: null };
    const JOY_SIZE = 120;
    const container = document.body;
    if (showJoystick) {
      this.joystickZoneEl = document.createElement("div");
      this.joystickZoneEl.id = "joy-zone";
      Object.assign(this.joystickZoneEl.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        width: `${JOY_SIZE + 40}px`,
        height: `${JOY_SIZE + 40}px`,
        touchAction: "none",
        zIndex: "999",
        pointerEvents: "auto",
        WebkitUserSelect: "none",
        userSelect: "none"
      });
      container.appendChild(this.joystickZoneEl);
      this.blockTouch(this.joystickZoneEl);
      this.joystick = new VirtualJoystick(
        this.joystickZoneEl,
        JOY_SIZE,
        (data) => {
          const rawX = data.vector?.x ?? 0;
          const rawY = data.vector?.y ?? 0;
          const distance = data.distance ?? 0;
          const deadzone = 0.2;
          const magnitude = Math.hypot(rawX, rawY);
          const moveX = magnitude > deadzone ? rawX / magnitude : 0;
          const moveY = magnitude > deadzone ? rawY / magnitude : 0;
          const isSprinting = distance >= JOY_SIZE / 2;
          const prev = this.prevJoyState;
          if (Math.abs(moveX - prev.moveX) < 1e-4 && Math.abs(moveY - prev.moveY) < 1e-4 && isSprinting === prev.shift) return;
          this.prevJoyState = { moveX, moveY, shift: isSprinting };
          this.setInput({ moveX, moveY, shift: isSprinting });
        },
        () => {
          const prev = this.prevJoyState;
          if (prev.moveX !== 0 || prev.moveY !== 0 || prev.shift) {
            this.prevJoyState = { moveX: 0, moveY: 0, shift: false };
            this.setInput({ moveX: 0, moveY: 0, shift: false });
          }
        }
      );
    }
    this.lookAreaEl = document.createElement("div");
    Object.assign(this.lookAreaEl.style, {
      position: "absolute",
      right: "0",
      bottom: "0",
      width: "50%",
      height: "100%",
      zIndex: "998",
      touchAction: "none",
      WebkitUserSelect: "none",
      userSelect: "none"
    });
    container.appendChild(this.lookAreaEl);
    this.blockTouch(this.lookAreaEl);
    this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
    this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    if (showJump) {
      this.jumpBtnEl = this.createBtn(container, "jump", 14, 14);
      this.jumpBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.setInput({ jump: true });
      }, { passive: false });
      this.jumpBtnEl.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.setInput({ jump: false });
      }, { passive: false });
      this.jumpBtnEl.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        this.setInput({ jump: false });
      }, { passive: false });
    }
    if (showFly) {
      this.flyBtnEl = this.createBtn(container, "fly", 14, 14 + 80);
      this.flyBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.setInput({ toggleFly: true });
      }, { passive: false });
    }
    if (showView) {
      this.viewBtnEl = this.createBtn(container, "view", 14, 14 + 200);
      this.viewBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.setInput({ toggleView: true });
      }, { passive: false });
    }
    if (showVehicle) {
      this.vehicleBtnEl = this.createBtn(container, "vehicle", 14 + 100, 14 + 120);
      this.vehicleBtnEl.style.display = "none";
      this.vehicleBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.setInput({ toggleVehicle: true });
      }, { passive: false });
    }
  }
  // 销毁移动端控制
  destroy() {
    try {
      this.joystick?.destroy();
      this.joystick = null;
      if (this.lookAreaEl) {
        this.lookAreaEl.removeEventListener("pointerdown", this.onPointerDown);
        this.lookAreaEl.removeEventListener("pointermove", this.onPointerMove);
        this.lookAreaEl.removeEventListener("pointerup", this.onPointerUp);
        this.lookAreaEl.removeEventListener("pointercancel", this.onPointerUp);
      }
      [this.joystickZoneEl, this.lookAreaEl, this.jumpBtnEl, this.flyBtnEl, this.viewBtnEl, this.vehicleBtnEl].forEach((el) => el?.parentElement?.removeChild(el));
      this.joystickZoneEl = this.lookAreaEl = this.jumpBtnEl = this.flyBtnEl = this.viewBtnEl = this.vehicleBtnEl = null;
    } catch (e) {
      console.warn("\u9500\u6BC1\u79FB\u52A8\u7AEF\u63A7\u5236\u65F6\u51FA\u9519\uFF1A", e);
    }
  }
  // 同步车辆按钮显隐
  syncVehicleBtn(show) {
    if (this.vehicleBtnEl) this.vehicleBtnEl.style.display = show ? "flex" : "none";
  }
  // 同步控制模式按钮
  syncControllerModeBtn(mode) {
    if (!this.jumpBtnEl) return;
    if (mode === 0) {
      if (this.flyBtnEl) this.flyBtnEl.style.display = "flex";
      this.setButtonIcon(this.jumpBtnEl, "jump");
    } else {
      if (this.flyBtnEl) this.flyBtnEl.style.display = "none";
      this.setButtonIcon(this.jumpBtnEl, "brake");
    }
  }
  // 阻止默认触摸
  blockTouch(el) {
    ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((name) => {
      el.addEventListener(name, (e) => e.preventDefault(), { passive: false });
    });
  }
  getButtonOptions(name) {
    const options = this.options[name];
    return typeof options === "object" ? options : void 0;
  }
  getIconUrl(iconName) {
    if (iconName === "brake") {
      const jumpOptions = this.options.jump;
      return typeof jumpOptions === "object" ? jumpOptions.brakeIcon : void 0;
    }
    return this.getButtonOptions(iconName)?.icon;
  }
  // 创建圆形按钮
  createBtn(container, name, defaultRight, defaultBottom) {
    const btn = document.createElement("button");
    const layout = this.getButtonOptions(name);
    const size = layout?.size ?? 56;
    const idleShadow = "0 6px 12px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.35), inset 0 2px 2px rgba(255,255,255,0.24), inset 0 -2px 3px rgba(0,0,0,0.5)";
    const pressedShadow = "0 2px 5px rgba(0,0,0,0.35), inset 0 2px 4px rgba(0,0,0,0.65), inset 0 -1px 1px rgba(255,255,255,0.12)";
    Object.assign(btn.style, {
      position: "absolute",
      right: `${layout?.right ?? defaultRight}px`,
      bottom: `${layout?.bottom ?? defaultBottom}px`,
      width: `${size}px`,
      height: `${size}px`,
      zIndex: "1000",
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.45)",
      padding: "0",
      opacity: "0.95",
      touchAction: "none",
      fontSize: "14px",
      userSelect: "none",
      overflow: "hidden",
      boxSizing: "border-box",
      appearance: "none",
      WebkitAppearance: "none",
      WebkitTapHighlightColor: "transparent",
      background: "linear-gradient(145deg, rgba(82,82,82,0.95) 0%, rgba(34,34,34,0.96) 55%, rgba(10,10,10,0.98) 100%)",
      boxShadow: idleShadow,
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transform: "translateY(0) scale(1)",
      transition: "transform 80ms ease, box-shadow 80ms ease, background 80ms ease",
      willChange: "transform"
    });
    if (layout?.left !== void 0) {
      btn.style.left = `${layout.left}px`;
      if (layout.right === void 0) btn.style.right = "auto";
    }
    if (layout?.top !== void 0) {
      btn.style.top = `${layout.top}px`;
      if (layout.bottom === void 0) btn.style.bottom = "auto";
    }
    this.setButtonIcon(btn, name);
    container.appendChild(btn);
    const setPressed = (pressed) => {
      btn.style.transform = pressed ? "translateY(2px) scale(0.98)" : "translateY(0) scale(1)";
      btn.style.boxShadow = pressed ? pressedShadow : idleShadow;
      btn.style.background = pressed ? "linear-gradient(145deg, rgba(22,22,22,0.98), rgba(52,52,52,0.96))" : "linear-gradient(145deg, rgba(82,82,82,0.95) 0%, rgba(34,34,34,0.96) 55%, rgba(10,10,10,0.98) 100%)";
    };
    btn.addEventListener("pointerdown", () => setPressed(true));
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      btn.addEventListener(eventName, () => setPressed(false));
    });
    ["touchstart", "touchend", "touchcancel"].forEach((name2) => {
      btn.addEventListener(name2, (e) => e.preventDefault(), { passive: false });
    });
    return btn;
  }
  // 设置按钮内容
  setButtonIcon(btn, iconName) {
    const customIconUrl = this.getIconUrl(iconName);
    let icon;
    if (customIconUrl !== void 0) {
      const image = document.createElement("img");
      image.src = customIconUrl;
      image.alt = "";
      image.draggable = false;
      icon = image;
    } else {
      const label = document.createElement("span");
      label.textContent = iconLabels[iconName];
      icon = label;
    }
    Object.assign(icon.style, {
      width: "80%",
      height: "80%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      objectFit: "contain",
      pointerEvents: "none",
      flex: "none",
      fontSize: "11px",
      fontWeight: "700",
      fontFamily: "system-ui, sans-serif",
      lineHeight: "1",
      letterSpacing: "0.04em",
      textShadow: "0 1px 2px rgba(0,0,0,0.9)"
    });
    btn.replaceChildren(icon);
  }
};

// src/systems/AnimationSystem.ts
import * as THREE from "three";
var AnimationSystem = class {
  // 覆盖动画播放时的输入快照，用于检测打断
  constructor(ctrl) {
    // 当前播放状态
    this.sets = /* @__PURE__ */ new Map();
    // 动作集合组
    this.currentLocomotionSet = null;
    // 当前激活的动作集合名
    this.clips = [];
    // 原始动画片段
    this.hasThreePartJump = false;
    // 是否使用三段跳跃动画
    this.isOverrideAnimationPlaying = false;
    // 动画锁，用于防止覆盖型动画被移动动画打断
    this.overrideInputSnapshot = null;
    this.ctrl = ctrl;
  }
  // 按名切换动画
  playByName(name, fade = 0.18) {
    if (!this.actions) return;
    const next = this.actions.get(name);
    if (!next || this.state === next) return;
    const prev = this.state;
    next.reset();
    next.setEffectiveWeight(1);
    next.paused = false;
    next.play();
    if (prev && prev !== next) {
      prev.fadeOut(fade);
      next.fadeIn(fade);
    } else next.fadeIn(fade);
    this.state = next;
    this.ctrl.onAnimationChange?.(name, next);
  }
  // 注册自定义动画
  register(key, clipName, opts) {
    if (!this.mixer || !this.actions) return;
    const clip = this.clips.find((c) => c.name === clipName);
    if (!clip) {
      console.warn(`\u627E\u4E0D\u5230 "${clipName}" \u52A8\u753B`);
      return;
    }
    const action = this.mixer.clipAction(clip);
    const timeScale = opts?.duration ? clip.duration / opts.duration : opts?.timeScale ?? 1;
    action.setLoop(opts?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = opts?.clampWhenFinished ?? false;
    action.setEffectiveTimeScale(timeScale);
    action.enabled = true;
    action.setEffectiveWeight(0);
    this.actions.set(key, action);
    if (opts?.onFinished) {
      this.mixer.addEventListener("finished", (ev) => {
        if (ev.action === action) opts.onFinished();
      });
    }
  }
  // 注册移动动作组
  registerLocomotionSet(setName, map) {
    if (!this.mixer) return;
    const set = /* @__PURE__ */ new Map();
    for (const [key, clipName] of Object.entries(map)) {
      const clip = this.clips.find((c) => c.name === clipName);
      if (!clip) {
        console.warn(`registerLocomotionSet: \u627E\u4E0D\u5230 "${clipName}"`);
        continue;
      }
      const action = this.mixer.clipAction(clip);
      if (key === "jumping") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.setEffectiveTimeScale(1.2);
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.setEffectiveTimeScale(1);
      }
      action.enabled = true;
      action.setEffectiveWeight(0);
      set.set(key, action);
    }
    this.sets.set(setName, set);
  }
  // 切换移动动作组
  switchLocomotionSet(setName, fade = 0.18) {
    if (!this.actions) return;
    const set = this.sets.get(setName);
    if (!set) {
      console.warn(`switchLocomotionSet: \u672A\u627E\u5230\u96C6\u5408 "${setName}"`);
      return;
    }
    this.currentLocomotionSet = setName;
    for (const [key, newAction] of set.entries()) {
      const oldAction = this.actions.get(key);
      if (oldAction === newAction) continue;
      if (oldAction) oldAction.fadeOut(fade);
      this.actions.set(key, newAction);
      if (this.state === oldAction) {
        newAction.reset();
        newAction.setEffectiveWeight(1);
        newAction.fadeIn(fade);
        newAction.play();
        this.state = newAction;
        this.ctrl.onAnimationChange?.(key, newAction);
      }
    }
  }
  // 播放已注册动画
  play(key, opts) {
    if (!this.actions) return;
    const action = this.actions.get(key);
    if (!action) {
      console.warn(`playAnimation: "${key}" \u672A\u6CE8\u518C`);
      return;
    }
    if (action.loop === THREE.LoopOnce) {
      this.isOverrideAnimationPlaying = true;
      this.overrideInputSnapshot = { ...this.ctrl.input };
      const onFinish = (e) => {
        if (e.action === action) {
          if (this.isOverrideAnimationPlaying && this.overrideInputSnapshot) {
            this.isOverrideAnimationPlaying = false;
            this.overrideInputSnapshot = null;
          }
          this.mixer.removeEventListener("finished", onFinish);
        }
      };
      this.mixer.addEventListener("finished", onFinish);
    }
    if (opts?.force) action.reset();
    const prevState = opts?.returnToPrev ? this.state : null;
    this.playByName(key, opts?.fade ?? 0.18);
    if (opts?.returnToPrev && prevState && this.mixer) {
      const action2 = this.actions.get(key);
      const fade = opts?.fade ?? 0.18;
      const handler = (ev) => {
        if (ev.action === action2 && this.state === action2) {
          this.mixer.removeEventListener("finished", handler);
          const cur = this.state;
          cur.stop();
          prevState.reset();
          prevState.setEffectiveWeight(1);
          prevState.play();
          this.state = prevState;
          this.ctrl.onAnimationChange?.(prevState.getClip().name, prevState);
        }
      };
      this.mixer.addEventListener("finished", handler);
    }
  }
  // 触发跳跃动画（统一入口）
  startJump(inAir = false) {
    if (this.hasThreePartJump) {
      this.playByName(inAir ? "jumpLoop" : "jumpStart");
    } else {
      this.playByName("jumping");
    }
  }
  // 离地时触发 jumpLoop（三段模式专用）
  onBecomeAirborne() {
    if (!this.hasThreePartJump) return;
    const s = this.state;
    const a = this.actions;
    if (s === a?.get("jumpStart") || s === a?.get("jumpLoop") || s === a?.get("jumpEnd")) return;
    this.playByName("jumpLoop");
  }
  // 落地时触发 jumpEnd（三段模式专用）
  onLand() {
    if (!this.hasThreePartJump) return;
    const s = this.state;
    const a = this.actions;
    if (s === a?.get("jumpStart") || s === a?.get("jumpLoop")) {
      const { fwd, bkd, lft, rgt } = this.ctrl.input;
      if (fwd || bkd || lft || rgt) {
        this.setAnimationByPressed();
        return;
      }
      this.playByName("jumpEnd");
    }
  }
  // 是否处于任意跳跃动画中（用于防止在跳跃动画播放时重复起跳）
  isJumping() {
    const s = this.state;
    const a = this.actions;
    if (!a) return false;
    return s === a.get("jumping") || s === a.get("jumpStart") || s === a.get("jumpLoop") || s === a.get("jumpEnd");
  }
  // 获取当前动画名
  getCurrentName() {
    return this.state?.getClip()?.name ?? null;
  }
  // 更新所有混合器
  updateMixers(delta) {
    this.mixer?.update(delta);
  }
  // 按键状态触发动画
  setAnimationByPressed() {
    if (this.isOverrideAnimationPlaying) {
      const currentInput = this.ctrl.input;
      const snapshot = this.overrideInputSnapshot;
      let inputChanged = false;
      if (snapshot) {
        for (const key in snapshot) {
          if (snapshot[key] !== currentInput[key]) {
            inputChanged = true;
            break;
          }
        }
      }
      if (inputChanged) {
        this.isOverrideAnimationPlaying = false;
        this.overrideInputSnapshot = null;
      } else {
        return;
      }
    }
    this.ctrl.cam.applyFlySprintMaxDist();
    if (this.ctrl.controllerMode === 1) return;
    const { fwd, bkd, lft, rgt, shift, space } = this.ctrl.input;
    if (this.ctrl.isFlying) {
      if (fwd) {
        if (shift) {
          this.playByName("flying");
        } else {
          this.playByName("flyHoverForward");
        }
        return;
      }
      if (bkd) {
        this.playByName("flyHoverBack");
        return;
      }
      if (lft) {
        this.playByName("flyHoverLeft");
        return;
      }
      if (rgt) {
        this.playByName("flyHoverRight");
        return;
      }
      if (space) {
        this.playByName("flyHoverUp");
        return;
      }
      this.playByName("flyidle");
      return;
    }
    if (this.ctrl.playerIsOnGround) {
      if (this.hasThreePartJump && this.state === this.actions?.get("jumpEnd") && !fwd && !bkd && !lft && !rgt) return;
      if (!fwd && !bkd && !lft && !rgt) {
        this.playByName("idle");
        return;
      }
      if (fwd) {
        this.playByName(shift ? "running" : "walking");
        return;
      }
      if (!this.ctrl.isFirstPerson && (lft || rgt || bkd)) {
        this.playByName(shift ? "running" : "walking");
        return;
      }
      if (lft) {
        this.playByName("left_walking");
        return;
      }
      if (rgt) {
        this.playByName("right_walking");
        return;
      }
      if (bkd) {
        this.playByName("walking_backward");
        return;
      }
    }
  }
};

// src/systems/CameraSystem.ts
import * as THREE2 from "three";
var CameraSystem = class {
  // 玩家到相机向量
  constructor(ctrl) {
    // 主控制器引用
    this.collisionLerp = 0.18;
    // 碰撞插值速度
    this.epsilon = 35;
    // 安全距离偏移
    this.minDist = 100;
    // 最小相机距离
    this.maxDist = 440;
    // 最大相机距离
    this.originMaxDist = 440;
    // 配置的默认最远距离
    this.sensitivity = 5;
    // 鼠标灵敏度
    this.mouseMode = 1;
    // 鼠标控制模式
    this.zoomEnabled = false;
    // 是否允许缩放
    this.lookAtHeightRatio = 0.8;
    // 第三人称看向点高度比例（0=底部，1=顶部）
    this.overShoulderOffsetRatio = 0.2;
    // 第三人称相机过肩视角横向偏移比例
    this.lookAtPoint = new THREE2.Vector3();
    // 预分配的看向点向量
    this.enableSpringCamera = false;
    this.springCameraTime = 0.05;
    this.vehicleTurnLerp = 0.01;
    this._springVelocity = new THREE2.Vector3();
    this._springResult = new THREE2.Vector3();
    this.zoomWheelElement = null;
    this.boundZoomWheel = (event) => this.onZoomWheel(event);
    this._flySprintMaxDistBoost = false;
    this._flySprintSavedMaxDist = 0;
    this.raycaster = new THREE2.Raycaster(new THREE2.Vector3(), new THREE2.Vector3());
    // 相机碰撞射线
    this.centerRay = new THREE2.Raycaster();
    // 屏幕中心射线
    this.centerMouse = new THREE2.Vector2();
    // 屏幕中心坐标
    this.playerToCam = new THREE2.Vector3();
    this.ctrl = ctrl;
    this.raycaster.firstHitOnly = true;
  }
  // 通用弹簧阻尼：把 controls.target 朝 dest 平滑跟随，返回本帧的目标点
  springTarget(dest, delta) {
    if (!this.enableSpringCamera) return dest;
    const cur = this.ctrl.controls.target;
    const v = this._springVelocity;
    const out = this._springResult;
    const smoothTime = Math.max(1e-4, this.springCameraTime);
    const omega = 2 / smoothTime;
    const x = omega * delta;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const axes = ["x", "y", "z"];
    for (const a of axes) {
      const change = cur[a] - dest[a];
      const temp = (v[a] + omega * change) * delta;
      v[a] = (v[a] - omega * temp) * exp;
      let o = dest[a] + (change + temp) * exp;
      if (dest[a] - cur[a] > 0 === o > dest[a]) {
        o = dest[a];
        v[a] = 0;
      }
      out[a] = o;
    }
    return out;
  }
  // 第三人称相机看向点
  getLookAtPoint() {
    if (this.ctrl.controllerMode === 1 && this.ctrl.vehicle.active) {
      return this.lookAtPoint.copy(this.ctrl.vehicle.active.vehicleGroup.position);
    }
    const capsuleInfo = this.ctrl.playerCapsule.capsuleInfo;
    const r = capsuleInfo.radius;
    const sy = this.ctrl.playerCapsule.scale.y || 1;
    const totalH = -capsuleInfo.segment.end.y * sy + 2 * r;
    const y = this.ctrl.playerCapsule.position.y + r - totalH * (1 - this.lookAtHeightRatio);
    return this.lookAtPoint.copy(this.ctrl.playerCapsule.position).setY(y);
  }
  // 设置越肩视角
  setOverShoulder(enable) {
    if (!enable || this.ctrl.controllerMode === 1) {
      this.ctrl.camera.clearViewOffset();
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctrl.camera.setViewOffset(w, h, w * this.overShoulderOffsetRatio, 0, w, h);
  }
  // 切换视角模式
  changeView() {
    this.ctrl.onBeforeViewChange?.(this.ctrl.isFirstPerson);
    this.ctrl.isFirstPerson = !this.ctrl.isFirstPerson;
    if (this.ctrl.isFirstPerson) {
      const playerFwd = new THREE2.Vector3(0, 0, 1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
      const flatDir = new THREE2.Vector3(playerFwd.x, 0, playerFwd.z).normalize();
      if (flatDir.lengthSq() > 1e-3) {
        const yAngle = Math.atan2(flatDir.x, flatDir.z);
        this.ctrl.playerCapsule.rotation.set(0, yAngle, 0);
      }
      this.setFirstPerson();
      this.setOverShoulder(false);
    } else {
      this.ctrl.controls.enabled = true;
      this.ctrl.scene.attach(this.ctrl.camera);
      const dir = new THREE2.Vector3(0, 0, -1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
      const angle = Math.atan2(dir.z, dir.x);
      const s = this.ctrl.playerModelConfig.scale;
      const rawOffset = new THREE2.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s);
      this.ctrl.controls.target.copy(this.getLookAtPoint());
      this.ctrl.camera.position.copy(this.ctrl.controls.target).add(rawOffset.normalize().multiplyScalar(this.maxDist));
      this.ctrl.controls.enableZoom = false;
      this.setOverShoulder(this.ctrl.enableOverShoulderView);
    }
    this.setPointerLock();
    this.ctrl.onViewChange?.(this.ctrl.isFirstPerson);
  }
  // 进入第一人称
  setFirstPerson(vertAngle = 0) {
    this.ctrl.controls.enabled = false;
    const s = this.ctrl.playerModelConfig.scale;
    const sharedOffset = this.ctrl.playerModelConfig.firstPersonCameraOffset;
    if (this.ctrl.playerModelHead) {
      const [x, y, z] = sharedOffset ?? [0, 10, 20];
      this.ctrl.playerModelHead.attach(this.ctrl.camera);
      this.ctrl.camera.position.set(x, y, z);
    } else {
      const [x, y, z] = sharedOffset ?? [0, 40, 30];
      this.ctrl.playerCapsule.attach(this.ctrl.camera);
      this.ctrl.camera.position.set(x * s, y * s, z * s);
    }
    this.ctrl.camera.rotation.set(
      THREE2.MathUtils.clamp(vertAngle, -1.1, 1.4),
      Math.PI,
      0
    );
    this.ctrl.controls.enableZoom = false;
  }
  // 指针锁定控制
  setPointerLock() {
    const lockTarget = this.ctrl.controls.domElement;
    if (!lockTarget?.requestPointerLock) return;
    if ((this.mouseMode === 0 || this.mouseMode === 1 || this.mouseMode === 5) && !this.ctrl.isFirstPerson || this.ctrl.isFirstPerson) {
      lockTarget.requestPointerLock();
    } else {
      document.exitPointerLock();
    }
  }
  // 初始相机位置
  setCamPos() {
    requestAnimationFrame(() => {
      if (!this.ctrl.isFirstPerson) {
        const dir = new THREE2.Vector3(0, 0, -1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
        const angle = Math.atan2(dir.z, dir.x);
        const s = this.ctrl.playerModelConfig.scale;
        const rawOffset = new THREE2.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s);
        this.ctrl.controls.target.copy(this.getLookAtPoint());
        this.ctrl.camera.position.copy(this.ctrl.controls.target).add(rawOffset.normalize().multiplyScalar(this.maxDist));
        this.ctrl.controls.enableZoom = false;
      } else {
        this.setFirstPerson();
      }
      this.ctrl.camera.updateProjectionMatrix();
    });
  }
  // 初始化轨道控制
  initControls() {
    this.ctrl.controls.enableZoom = false;
    this.ctrl.controls.rotateSpeed = this.sensitivity * 0.05;
    this.ctrl.controls.maxPolarAngle = Math.PI;
    this.ctrl.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    this.ctrl.controls.minDistance = this.minDist;
    this.connectZoomWheel();
  }
  /** 切换第三人称滚轮缩放；关闭时恢复配置的默认最远距离。 */
  setZoomEnabled(enabled) {
    this.zoomEnabled = enabled;
    this.ctrl.controls.enableZoom = false;
    this._flySprintMaxDistBoost = false;
    this.maxDist = enabled ? Math.max(this.maxDist, this.minDist) : this.originMaxDist;
  }
  /** 非弹簧第三人称飞行加速时拉远相机，否则恢复默认最远距离。 */
  applyFlySprintMaxDist() {
    const boost = !this.enableSpringCamera && !this.ctrl.isFirstPerson && this.ctrl.controllerMode === 0 && this.ctrl.isFlying && this.ctrl.input.shift;
    if (!this.zoomEnabled) {
      this._flySprintMaxDistBoost = false;
      this.maxDist = this.originMaxDist * (boost ? 2 : 1);
      return;
    }
    if (boost && !this._flySprintMaxDistBoost) {
      this._flySprintSavedMaxDist = this.maxDist;
      this.maxDist *= 2;
      this._flySprintMaxDistBoost = true;
    } else if (!boost && this._flySprintMaxDistBoost) {
      this.maxDist = this._flySprintSavedMaxDist;
      this._flySprintMaxDistBoost = false;
    }
  }
  clearFlySprintMaxDistBoost() {
    this._flySprintMaxDistBoost = false;
  }
  /** 绑定到渲染画布，使普通鼠标与 Pointer Lock 状态共用同一滚轮入口。 */
  connectZoomWheel() {
    const element = this.ctrl.controls.domElement;
    if (!element) return;
    if (this.zoomWheelElement === element) return;
    this.disconnectZoomWheel();
    element.addEventListener("wheel", this.boundZoomWheel, { passive: false });
    this.zoomWheelElement = element;
  }
  disconnectZoomWheel() {
    this.zoomWheelElement?.removeEventListener("wheel", this.boundZoomWheel);
    this.zoomWheelElement = null;
  }
  /** 滚轮改变目标最远距离。 */
  onZoomWheel(event) {
    if (!this.zoomEnabled || this.ctrl.isFirstPerson || event.deltaY === 0) return;
    event.preventDefault();
    let deltaY = event.deltaY;
    if (event.deltaMode === 1) deltaY *= 16;
    else if (event.deltaMode === 2) deltaY *= 100;
    if (event.ctrlKey) deltaY *= 10;
    const scale = Math.pow(0.95, Math.abs(deltaY * 0.01));
    const nextDistance = deltaY < 0 ? this.maxDist * scale : this.maxDist / scale;
    this.maxDist = Math.max(nextDistance, this.minDist);
  }
  // 重置轨道控制
  resetControls() {
    if (!this.ctrl.controls) return;
    this.disconnectZoomWheel();
    this.ctrl.controls.enabled = true;
    this.ctrl.controls.enablePan = true;
    this.ctrl.controls.maxPolarAngle = Math.PI / 2;
    this.ctrl.controls.rotateSpeed = 1;
    this.ctrl.controls.enableZoom = true;
    this.ctrl.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
  }
  // 处理鼠标朝向
  setToward(dx, dy, speed) {
    this.ctrl.onTowardChange?.(dx, dy, speed);
    if (!this.ctrl.enableToward) return;
    const sens = this.sensitivity;
    if (this.ctrl.controllerMode === 0) {
      if (this.ctrl.isFirstPerson) {
        this.ctrl.playerCapsule.rotateY(-dx * speed * sens);
        this.ctrl.camera.rotation.x = THREE2.MathUtils.clamp(
          this.ctrl.camera.rotation.x + -dy * speed * sens,
          -Math.PI * (60 / 180),
          Math.PI * (80 / 180)
        );
      } else {
        this.orbit(this.getLookAtPoint(), -dx * speed * sens, -dy * speed * sens);
      }
    } else {
      const v = this.ctrl.vehicle.active;
      if (!v) return;
      if (this.ctrl.isFirstPerson) {
        this.ctrl.camera.rotation.y = THREE2.MathUtils.clamp(this.ctrl.camera.rotation.y + -dx * speed * sens, Math.PI * (3 / 4), Math.PI * (5 / 4));
        this.ctrl.camera.rotation.x = THREE2.MathUtils.clamp(this.ctrl.camera.rotation.x + -dy * speed * sens, 0, Math.PI * (1 / 3));
      } else {
        this.orbit(v.vehicleGroup.position, -dx * speed * sens, -dy * speed * sens);
      }
    }
  }
  // 手动轨道旋转
  orbit(target, deltaX, deltaY) {
    const distance = this.ctrl.camera.position.distanceTo(target);
    const cur = this.ctrl.camera.position.clone().sub(target);
    let theta = Math.atan2(cur.x, cur.z) + deltaX;
    let phi = Math.acos(THREE2.MathUtils.clamp(cur.y / distance, -1, 1)) + deltaY;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    this.ctrl.camera.position.set(
      target.x + distance * Math.sin(phi) * Math.sin(theta),
      target.y + distance * Math.cos(phi),
      target.z + distance * Math.sin(phi) * Math.cos(theta)
    );
    this.ctrl.camera.lookAt(target);
  }
  // 载具第三人称：弹簧跟随 + 射线避障 + 速度方向
  updateThirdPersonVehicle(delta) {
    const v = this.ctrl.vehicle.active;
    if (!v) return;
    const lookTarget = this.springTarget(v.vehicleGroup.position, delta).clone();
    this.ctrl.camera.position.sub(this.ctrl.controls.target);
    this.ctrl.controls.target.copy(lookTarget);
    this.ctrl.camera.position.add(lookTarget);
    this.ctrl.controls.update();
    const vehicleBaseDistance = Math.max(this.minDist, v.size.l * 0.8);
    const desiredDist = Math.max(this.maxDist, vehicleBaseDistance);
    this.updateWithRaycast(this.ctrl.controls.target, desiredDist);
    if ((this.ctrl.input.fwd || this.ctrl.input.bkd) && v.followVehicleDirection) {
      const vel = v.chassisBody.linvel();
      if (Math.hypot(vel.x, vel.z) > 0.3) {
        const targetAngle = Math.atan2(-vel.x, -vel.z);
        const offX = this.ctrl.camera.position.x - this.ctrl.controls.target.x;
        const offZ = this.ctrl.camera.position.z - this.ctrl.controls.target.z;
        const radius = Math.hypot(offX, offZ);
        const curAngle = Math.atan2(offX, offZ);
        const diff = Math.atan2(Math.sin(targetAngle - curAngle), Math.cos(targetAngle - curAngle));
        const newAngle = curAngle + diff * this.vehicleTurnLerp;
        this.ctrl.camera.position.x = this.ctrl.controls.target.x + Math.sin(newAngle) * radius;
        this.ctrl.camera.position.z = this.ctrl.controls.target.z + Math.cos(newAngle) * radius;
        this.ctrl.controls.update();
      }
    }
  }
  // 收集相机射线碰撞。开车时跳过当前车辆网格。
  collectCameraHits() {
    const skipIds = this.ctrl.controllerMode === 1 && this.ctrl.vehicle.active?.meshColliderId != null ? [this.ctrl.vehicle.active.meshColliderId] : void 0;
    const hits = [];
    for (const mesh of this.ctrl.getColliderMeshes({ skipIds })) {
      const meshHits = this.raycaster.intersectObject(mesh, false);
      if (meshHits[0] && (!hits[0] || meshHits[0].distance < hits[0].distance)) {
        hits[0] = meshHits[0];
      }
    }
    return hits;
  }
  // 射线防穿墙
  updateWithRaycast(origin, maxDist = this.maxDist, minDist = this.minDist) {
    this.playerToCam.subVectors(this.ctrl.camera.position, origin);
    const direction = this.playerToCam.clone().normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDist;
    const hits = this.collectCameraHits();
    if (hits.length > 0) {
      const safeDist = Math.max(hits[0].distance - this.epsilon, minDist);
      this.ctrl.camera.position.lerp(origin.clone().add(direction.multiplyScalar(safeDist)), this.collisionLerp);
    } else {
      this.raycaster.far = maxDist;
      const maxHits = this.collectCameraHits();
      const safeDist = maxHits.length > 0 ? Math.min(maxDist, maxHits[0].distance - this.epsilon) : maxDist;
      this.ctrl.camera.position.lerp(origin.clone().add(direction.multiplyScalar(safeDist)), this.collisionLerp);
    }
  }
  // 屏幕中心检测
  getCenterHit() {
    this.ctrl.camera.updateMatrixWorld();
    this.centerRay.setFromCamera(this.centerMouse, this.ctrl.camera);
    this.centerRay.layers.set(1);
    this.centerRay.layers.enable(2);
    const meshes = this.ctrl.getColliderMeshes();
    const checkTargets = meshes.length ? [...meshes, ...this.ctrl.scene.children] : this.ctrl.scene.children;
    const hits = this.centerRay.intersectObjects(checkTargets, true);
    hits.sort((a, b) => a.distance - b.distance);
    if (hits[0]) return hits[0];
    const fallbackPoint = this.centerRay.ray.at(1e3, new THREE2.Vector3());
    return {
      distance: 1e3,
      point: fallbackPoint,
      object: this.ctrl.camera,
      uv: null,
      normal: null,
      face: null,
      faceIndex: null,
      instanceId: void 0
    };
  }
};

// src/systems/InputSystem.ts
var defaultKeyMap = {
  forward: ["KeyW", "ArrowUp"],
  backward: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  toggleView: ["KeyV"],
  toggleFly: ["KeyF"],
  toggleVehicle: ["KeyE"]
};
var InputSystem = class {
  // 键码 -> 动作 反查表
  constructor(ctrl) {
    // 主控制器引用
    this.fwd = false;
    // 前进键
    this.bkd = false;
    // 后退键
    this.lft = false;
    // 左移键
    this.rgt = false;
    // 右移键
    this.space = false;
    // 跳跃键
    this.shift = false;
    // 加速键
    this.keyFwd = false;
    this.keyBkd = false;
    this.keyLft = false;
    this.keyRgt = false;
    this.analogMoveX = 0;
    this.analogMoveY = 0;
    this.boundKeydown = async (e) => this.onKeydown(e);
    // 键盘按下绑定
    this.boundKeyup = (e) => this.onKeyup(e);
    // 键盘抬起绑定
    this.boundMouseMove = (e) => this.onMouseMove(e);
    // 鼠标移动绑定
    this.boundMouseClick = (e) => {
      if (e.target === this.ctrl.controls.domElement) this.ctrl.cam.setPointerLock();
    };
    this.boundBlur = () => this.resetKeys();
    // 页面失焦时重置按键状态
    this.codeToAction = /* @__PURE__ */ new Map();
    this.ctrl = ctrl;
    this.buildKeyMap();
  }
  // 构建键码：动作 反查表：未传的动作用默认键，传 string/数组则覆盖，传 null 则禁用
  buildKeyMap(userMap) {
    this.codeToAction.clear();
    for (const action of Object.keys(defaultKeyMap)) {
      let codes;
      if (userMap && action in userMap) {
        const v = userMap[action];
        if (v == null) continue;
        codes = Array.isArray(v) ? v : [v];
      } else {
        codes = defaultKeyMap[action];
      }
      for (const code of codes) this.codeToAction.set(code, action);
    }
  }
  // 程序化输入接口
  setInput(input) {
    const c = this.ctrl;
    const prevFwd = this.fwd;
    const prevBkd = this.bkd;
    const prevLft = this.lft;
    const prevRgt = this.rgt;
    let moveChanged = false;
    if (typeof input.moveX === "number") {
      this.analogMoveX = Math.max(-1, Math.min(1, input.moveX));
      moveChanged = true;
    }
    if (typeof input.moveY === "number") {
      this.analogMoveY = Math.max(-1, Math.min(1, input.moveY));
      moveChanged = true;
    }
    if (moveChanged) {
      this.syncDirectionFlags();
      if (prevFwd !== this.fwd || prevBkd !== this.bkd || prevLft !== this.lft || prevRgt !== this.rgt) {
        c.animation.setAnimationByPressed();
      }
    }
    if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
      c.cam.setToward(input.lookDeltaX, input.lookDeltaY, 2e-3);
    }
    if (typeof input.jump === "boolean") this.applyAction("jump", input.jump);
    if (typeof input.shift === "boolean") this.applyAction("sprint", input.shift);
    if (input.toggleView) this.applyAction("toggleView", true);
    if (input.toggleFly) this.applyAction("toggleFly", true);
    if (input.toggleVehicle) this.applyAction("toggleVehicle", true);
  }
  // 绑定输入事件
  bindEvents() {
    this.ctrl.isupdate = true;
    this.ctrl.cam.setPointerLock();
    window.addEventListener("keydown", this.boundKeydown);
    window.addEventListener("keyup", this.boundKeyup);
    window.addEventListener("mousemove", this.boundMouseMove);
    window.addEventListener("click", this.boundMouseClick);
    window.addEventListener("blur", this.boundBlur);
  }
  // 解绑输入事件
  unbindEvents() {
    this.ctrl.isupdate = false;
    document.exitPointerLock();
    window.removeEventListener("keydown", this.boundKeydown);
    window.removeEventListener("keyup", this.boundKeyup);
    window.removeEventListener("mousemove", this.boundMouseMove);
    window.removeEventListener("click", this.boundMouseClick);
    window.removeEventListener("blur", this.boundBlur);
  }
  // 重置所有按键状态
  resetKeys() {
    const c = this.ctrl;
    this.keyFwd = false;
    this.keyBkd = false;
    this.keyLft = false;
    this.keyRgt = false;
    this.analogMoveX = 0;
    this.analogMoveY = 0;
    this.syncDirectionFlags();
    this.space = false;
    this.shift = false;
    c.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    c.animation.setAnimationByPressed();
  }
  // 统一动作派发
  applyAction(action, pressed) {
    const c = this.ctrl;
    switch (action) {
      // 前进
      case "forward":
        this.keyFwd = pressed;
        this.syncDirectionFlags();
        c.animation.setAnimationByPressed();
        break;
      // 后退
      case "backward":
        this.keyBkd = pressed;
        this.syncDirectionFlags();
        c.animation.setAnimationByPressed();
        break;
      // 左移
      case "left":
        this.keyLft = pressed;
        this.syncDirectionFlags();
        c.animation.setAnimationByPressed();
        break;
      // 右移
      case "right":
        this.keyRgt = pressed;
        this.syncDirectionFlags();
        c.animation.setAnimationByPressed();
        break;
      // 冲刺
      case "sprint":
        this.shift = pressed;
        c.animation.setAnimationByPressed();
        c.controls.mouseButtons = pressed ? { LEFT: 2, MIDDLE: 1, RIGHT: 0 } : { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        break;
      // 跳跃
      case "jump":
        if (pressed) {
          this.space = true;
          if (c.controllerMode === 1) return;
          if (c.isFlying) {
            c.animation.setAnimationByPressed();
            return;
          }
          if (!c.playerIsOnGround) return;
          if (c.animation.isJumping()) return;
          c.animation.startJump();
          c.playerVelocity.y = c.jumpHeight;
          c.setOnGround(false);
        } else {
          this.space = false;
          if (c.isFlying) c.animation.setAnimationByPressed();
        }
        break;
      // 切换第一 / 第三人称视角
      case "toggleView":
        if (pressed) c.cam.changeView();
        break;
      // 切换飞行模式
      case "toggleFly":
        if (pressed && c.controllerMode === 0) {
          c.isFlying = !c.isFlying;
          if (c.isFlying) c.playerVelocity.set(0, 0, 0);
          c.animation.setAnimationByPressed();
          if (!c.isFlying && !c.playerIsOnGround) c.animation.startJump(true);
        }
        break;
      // 上 / 下车
      case "toggleVehicle":
        if (pressed) {
          if (c.isFlying) return;
          if (c.controllerMode === 0) c.vehicle.enter();
          else c.vehicle.exit();
        }
        break;
    }
  }
  // 获取最终移动轴：模拟输入优先，否则使用键盘八方向
  getMoveAxes() {
    const hasAnalogInput = this.analogMoveX !== 0 || this.analogMoveY !== 0;
    if (hasAnalogInput) return { x: this.analogMoveX, y: this.analogMoveY, isAnalog: true };
    return {
      x: Number(this.keyRgt) - Number(this.keyLft),
      y: Number(this.keyFwd) - Number(this.keyBkd),
      isAnalog: false
    };
  }
  // 合并键盘与模拟输入，供动画和车辆等现有布尔逻辑使用
  syncDirectionFlags() {
    const threshold = 0.2;
    this.fwd = this.keyFwd || this.analogMoveY > threshold;
    this.bkd = this.keyBkd || this.analogMoveY < -threshold;
    this.lft = this.keyLft || this.analogMoveX < -threshold;
    this.rgt = this.keyRgt || this.analogMoveX > threshold;
  }
  // 键盘按下处理
  onKeydown(e) {
    const action = this.codeToAction.get(e.code);
    if (action) this.applyAction(action, true);
  }
  // 键盘抬起处理
  onKeyup(e) {
    const action = this.codeToAction.get(e.code);
    if (action) this.applyAction(action, false);
  }
  // 鼠标移动处理
  onMouseMove(e) {
    const lockTarget = this.ctrl.controls.domElement;
    if (lockTarget && document.pointerLockElement === lockTarget) {
      this.ctrl.cam.setToward(e.movementX, e.movementY, 1e-4);
    }
  }
};

// src/systems/VehicleSystem.ts
import * as THREE17 from "three";

// src/utils/vehicleLoader.ts
import * as THREE14 from "three";

// src/utils/vehicleController.ts
import * as THREE11 from "three";

// src/utils/vehiclePhysics/BVHVehicleController.ts
import * as THREE10 from "three";

// src/utils/vehiclePhysics/VehicleCollision.ts
import * as THREE6 from "three";

// src/collision/contacts/ContactPoint.ts
import * as THREE3 from "three";
var CONTACT_REF_EXTENT = 0.2;
var CONTACT_SKIN = 2e-3;
function contactSkinForExtent(extent) {
  const s = Math.max(1e-4, extent) / CONTACT_REF_EXTENT;
  return CONTACT_SKIN * s;
}
var ContactPoint = class {
  constructor() {
    this.worldPoint = new THREE3.Vector3();
    this.localPoint = new THREE3.Vector3();
    this.penetration = 0;
    this.biasVelocity = 0;
    this.normalImpulse = 0;
    this.tangentImpulse1 = 0;
    this.tangentImpulse2 = 0;
    this.tangent1 = new THREE3.Vector3();
    this.tangent2 = new THREE3.Vector3();
  }
  copyFrom(other) {
    this.worldPoint.copy(other.worldPoint);
    this.localPoint.copy(other.localPoint);
    this.penetration = other.penetration;
    this.normalImpulse = other.normalImpulse;
    this.tangentImpulse1 = other.tangentImpulse1;
    this.tangentImpulse2 = other.tangentImpulse2;
    this.tangent1.copy(other.tangent1);
    this.tangent2.copy(other.tangent2);
  }
  resetImpulses() {
    this.normalImpulse = 0;
    this.tangentImpulse1 = 0;
    this.tangentImpulse2 = 0;
  }
};

// src/collision/contacts/contactReducer.ts
import * as THREE5 from "three";

// src/collision/contacts/ContactManifold.ts
import * as THREE4 from "three";
var ContactManifold = class {
  constructor() {
    this.normal = new THREE4.Vector3();
    this.normalSum = new THREE4.Vector3();
    this.contacts = [];
  }
  clear() {
    this.contacts.length = 0;
    this.normal.set(0, 1, 0);
    this.normalSum.set(0, 0, 0);
  }
};

// src/collision/contacts/contactReducer.ts
var NORMAL_MERGE = 0.98;
var MAX_POINTS = 4;
var SUPPORT_Y = 0.7;
var WALL_Y = 0.35;
var _invQuat = new THREE5.Quaternion();
var _ab = new THREE5.Vector3();
var _ac = new THREE5.Vector3();
var _ap = new THREE5.Vector3();
var _n = new THREE5.Vector3();
function reduceContacts(raw, count, body, out) {
  for (const m of out) m.clear();
  let manifoldCount = 0;
  const skin = contactSkinForExtent(body.characteristicExtent?.() ?? CONTACT_REF_EXTENT);
  for (let r = 0; r < count; r++) {
    const contact = raw[r];
    if (contact.penetration < -skin || contact.normal.lengthSq() < 1e-8) continue;
    _n.copy(contact.normal).normalize();
    let cluster = -1;
    for (let i = 0; i < manifoldCount; i++) {
      if (out[i].normal.dot(_n) > NORMAL_MERGE) {
        cluster = i;
        break;
      }
    }
    if (cluster < 0) {
      if (manifoldCount === out.length) {
        out.push(new ContactManifold());
      }
      cluster = manifoldCount;
      manifoldCount += 1;
      out[cluster].normalSum.copy(_n);
      out[cluster].normal.copy(_n);
    } else {
      out[cluster].normalSum.add(_n);
      out[cluster].normal.copy(out[cluster].normalSum).normalize();
    }
    out[cluster].contacts.push(makePoint(contact, body));
  }
  for (let i = 0; i < manifoldCount; i++) {
    const manifold = out[i];
    if (manifold.normalSum.lengthSq() < 1e-8) manifold.normal.set(0, 1, 0);
    else manifold.normal.copy(manifold.normalSum).normalize();
    if (manifold.contacts.length > MAX_POINTS) {
      manifold.contacts = pickSupportPoints(manifold.contacts);
    }
    for (const point of manifold.contacts) {
      buildTangents(manifold.normal, point);
    }
  }
  out.length = manifoldCount;
  stabilizeEdgeManifolds(out);
  return out;
}
function normalClass(normal) {
  if (normal.y >= SUPPORT_Y) return "support";
  if (normal.y <= WALL_Y) return "wall";
  return "slant";
}
function stabilizeEdgeManifolds(manifolds) {
  let hasSupport = false;
  let hasWall = false;
  for (const m of manifolds) {
    const cls = normalClass(m.normal);
    if (cls === "support") hasSupport = true;
    else if (cls === "wall") hasWall = true;
  }
  if (hasSupport && hasWall) {
    let write = 0;
    for (let i = 0; i < manifolds.length; i++) {
      if (normalClass(manifolds[i].normal) === "slant") continue;
      if (write !== i) manifolds[write] = manifolds[i];
      write += 1;
    }
    manifolds.length = write;
    return;
  }
  if (!hasSupport) {
    for (const m of manifolds) {
      if (normalClass(m.normal) !== "slant") continue;
      m.normal.y = Math.max(m.normal.y, SUPPORT_Y);
      m.normal.normalize();
      m.normalSum.copy(m.normal);
      for (const point of m.contacts) {
        buildTangents(m.normal, point);
      }
    }
  }
}
function makePoint(raw, body) {
  const point = new ContactPoint();
  point.worldPoint.copy(raw.point);
  point.penetration = raw.penetration;
  _invQuat.copy(body.quaternion).invert();
  point.localPoint.subVectors(raw.point, body.position).applyQuaternion(_invQuat);
  return point;
}
function pickSupportPoints(points) {
  if (points.length <= MAX_POINTS) return points;
  let i0 = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].penetration > points[i0].penetration) i0 = i;
  }
  const p0 = points[i0];
  let i1 = i0;
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    const d = points[i].worldPoint.distanceToSquared(p0.worldPoint);
    if (d > best) {
      best = d;
      i1 = i;
    }
  }
  const p1 = points[i1];
  let i2 = i0;
  best = -1;
  _ab.subVectors(p1.worldPoint, p0.worldPoint);
  for (let i = 0; i < points.length; i++) {
    _ap.subVectors(points[i].worldPoint, p0.worldPoint);
    const area = _ap.cross(_ab).lengthSq();
    if (area > best) {
      best = area;
      i2 = i;
    }
  }
  const p2 = points[i2];
  let i3 = i0;
  best = -1;
  _ab.subVectors(p1.worldPoint, p0.worldPoint);
  _ac.subVectors(p2.worldPoint, p0.worldPoint);
  _n.copy(_ab).cross(_ac);
  for (let i = 0; i < points.length; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    _ap.subVectors(points[i].worldPoint, p0.worldPoint);
    const d = Math.abs(_ap.dot(_n));
    const score = d + points[i].penetration * 0.01;
    if (score > best) {
      best = score;
      i3 = i;
    }
  }
  const picked = [p0];
  if (i1 !== i0) picked.push(p1);
  if (i2 !== i0 && i2 !== i1) picked.push(p2);
  if (i3 !== i0 && i3 !== i1 && i3 !== i2 && picked.length < MAX_POINTS) picked.push(points[i3]);
  return picked;
}
function buildTangents(normal, point) {
  if (Math.abs(normal.y) < 0.99) point.tangent1.set(0, 1, 0).cross(normal);
  else point.tangent1.set(1, 0, 0).cross(normal);
  if (point.tangent1.lengthSq() < 1e-8) point.tangent1.set(0, 0, 1).cross(normal);
  point.tangent1.normalize();
  point.tangent2.copy(normal).cross(point.tangent1).normalize();
}

// src/utils/vehiclePhysics/vehicleMath.ts
var EPS = 1e-8;
function impulseDenominator(body, point, normal, r, gcross, local, world, invQuat) {
  r.subVectors(point, body.position);
  gcross.copy(r).cross(normal);
  invQuat.copy(body.quaternion).invert();
  local.copy(gcross).applyQuaternion(invQuat);
  local.x *= body.invInertia.x;
  local.y *= body.invInertia.y;
  local.z *= body.invInertia.z;
  world.copy(local).applyQuaternion(body.quaternion);
  world.cross(r);
  return body.invMass + normal.dot(world);
}
function effectiveMass(body, point, normal, r, gcross, local, world, invQuat) {
  const denom = impulseDenominator(body, point, normal, r, gcross, local, world, invQuat);
  return denom > EPS ? 1 / denom : 0;
}
function integrateQuaternion(q, omega, dt) {
  const halfDt = 0.5 * dt;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const wx = omega.x, wy = omega.y, wz = omega.z;
  q.x += halfDt * (wx * qw + wy * qz - wz * qy);
  q.y += halfDt * (wy * qw + wz * qx - wx * qz);
  q.z += halfDt * (wz * qw + wx * qy - wy * qx);
  q.w += halfDt * (-wx * qx - wy * qy - wz * qz);
  q.normalize();
}
function closestPointOnTriangle(p, a, b, c, out, ab, ac, ap, bp, cp) {
  ab.subVectors(b, a);
  ac.subVectors(c, a);
  ap.subVectors(p, a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  bp.subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(ab, v);
  }
  cp.subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(ac, w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return out.copy(b).addScaledVector(ab.subVectors(c, b), w);
  }
  const denom = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom);
}

// src/utils/vehiclePhysics/VehicleCollision.ts
var MAX_RAW = 96;
var CCD_SIZE_RATIO = 0.12;
var VehicleCollision = class {
  /** 配置射线只取最近命中。 */
  constructor() {
    this.raw = Array.from({ length: MAX_RAW }, () => ({
      point: new THREE6.Vector3(),
      normal: new THREE6.Vector3(),
      penetration: 0
    }));
    this.rawCount = 0;
    this.manifolds = [];
    this.toward = new THREE6.Vector3();
    this.invMat = new THREE6.Matrix4();
    this.worldMat = new THREE6.Matrix4();
    this.normalMat = new THREE6.Matrix3();
    this.localAABB = new THREE6.Box3();
    this.worldAABB = new THREE6.Box3();
    this.corner = new THREE6.Vector3();
    this.prevCorner = new THREE6.Vector3();
    this.axisX = new THREE6.Vector3();
    this.axisY = new THREE6.Vector3();
    this.axisZ = new THREE6.Vector3();
    this.prevAxisX = new THREE6.Vector3();
    this.prevAxisY = new THREE6.Vector3();
    this.prevAxisZ = new THREE6.Vector3();
    this.toiQuat = new THREE6.Quaternion();
    this.localCenter = new THREE6.Vector3();
    this.localAxisX = new THREE6.Vector3();
    this.localAxisY = new THREE6.Vector3();
    this.localAxisZ = new THREE6.Vector3();
    this.triN = new THREE6.Vector3();
    this.edge = new THREE6.Vector3();
    this.testAxis = new THREE6.Vector3();
    this.bestAxis = new THREE6.Vector3();
    this.rangeA = { min: 0, max: 0 };
    this.rangeB = { min: 0, max: 0 };
    this.closest = new THREE6.Vector3();
    this.ab = new THREE6.Vector3();
    this.ac = new THREE6.Vector3();
    this.ap = new THREE6.Vector3();
    this.bp = new THREE6.Vector3();
    this.cp = new THREE6.Vector3();
    this.impulse = new THREE6.Vector3();
    this.support = new THREE6.Vector3();
    this.bodyHalf = new THREE6.Vector3();
    this.raycaster = new THREE6.Raycaster();
    /** 当前 detect 按刚体尺寸缩放后的接触皮肤。 */
    this.contactSkin = CONTACT_SKIN;
    this.raycaster.firstHitOnly = true;
  }
  /** 收集 OBB 与一组网格的接触流形。 */
  detect(body, colliders) {
    this.rawCount = 0;
    this.manifolds.length = 0;
    const extent = Math.max(body.halfExtents.x, body.halfExtents.y, body.halfExtents.z);
    this.contactSkin = contactSkinForExtent(extent);
    for (const collider of this.toList(colliders)) {
      const tree = collider.geometry?.boundsTree;
      if (!tree) continue;
      this.collectRawContacts(body, collider, tree);
    }
    if (this.rawCount === 0) return this.manifolds;
    return reduceContacts(this.raw, this.rawCount, body, this.manifolds);
  }
  /** 本帧位移是否大到需要扫掠。 */
  needsSwept(body, dt) {
    const hx = body.halfExtents.x;
    const hy = body.halfExtents.y;
    const hz = body.halfExtents.z;
    const minSize = 2 * Math.min(hx, hy, hz);
    const linTravel = body.linearVelocity.length() * dt;
    const angTravel = body.angularVelocity.length() * Math.hypot(hx, hy, hz) * dt;
    return linTravel + angTravel > minSize * CCD_SIZE_RATIO;
  }
  /** 高速穿模时按 TOI 回退位置和朝向。 */
  solveSwept(body, colliders, prevPosition, prevQuaternion) {
    const list = this.toList(colliders);
    if (!list.length) return;
    this.solveSweptCollision(body, list, prevPosition, prevQuaternion);
  }
  /** 对 8 个角点和中心扫过所有网格，按最早 TOI 回退。 */
  solveSweptCollision(body, colliders, prevPosition, prevQuaternion) {
    this.bodyHalf.copy(body.halfExtents);
    this.setAxes(prevQuaternion, this.prevAxisX, this.prevAxisY, this.prevAxisZ);
    this.setAxes(body.quaternion, this.axisX, this.axisY, this.axisZ);
    this.raycaster.near = 0;
    let minToi = 1;
    let hitNormal = null;
    for (let i = 0; i < 9; i++) {
      if (i === 8) {
        this.prevCorner.copy(prevPosition);
        this.corner.copy(body.position);
      } else {
        const sx = i & 1 ? 1 : -1;
        const sy = i & 2 ? 1 : -1;
        const sz = i & 4 ? 1 : -1;
        this.cornerFrom(prevPosition, this.prevAxisX, this.prevAxisY, this.prevAxisZ, sx, sy, sz, this.prevCorner);
        this.cornerFrom(body.position, this.axisX, this.axisY, this.axisZ, sx, sy, sz, this.corner);
      }
      this.impulse.subVectors(this.corner, this.prevCorner);
      const len = this.impulse.length();
      if (len < 1e-6) continue;
      this.impulse.multiplyScalar(1 / len);
      this.raycaster.set(this.prevCorner, this.impulse);
      this.raycaster.far = len;
      const hits = this.raycaster.intersectObjects(colliders, false);
      if (!hits.length) continue;
      const hit = hits[0];
      const toi = hit.distance / len;
      if (toi >= minToi || toi <= 1e-4) continue;
      minToi = toi;
      if (hit.face) {
        this.normalMat.getNormalMatrix(hit.object.matrixWorld);
        this.bestAxis.copy(hit.face.normal).applyMatrix3(this.normalMat).normalize();
        if (this.bestAxis.dot(this.impulse) > 0) this.bestAxis.negate();
        this.toward.copy(this.bestAxis);
        hitNormal = this.toward;
      }
    }
    if (minToi >= 1) return;
    const t = minToi * 0.95;
    body.position.lerpVectors(prevPosition, body.position, t);
    this.toiQuat.slerpQuaternions(prevQuaternion, body.quaternion, t);
    body.quaternion.copy(this.toiQuat);
    if (!hitNormal) return;
    const vn = body.linearVelocity.dot(hitNormal);
    if (vn < 0) body.linearVelocity.addScaledVector(hitNormal, -vn);
  }
  /** 把单个网格或列表收成可遍历数组。 */
  toList(colliders) {
    if (!colliders) return [];
    return Array.isArray(colliders) ? colliders : [colliders];
  }
  /** 用 BVH shapecast 收集与 OBB 相交的三角。 */
  collectRawContacts(body, collider, tree) {
    this.setWorldAxes(body);
    this.worldMat.copy(collider.matrixWorld);
    this.invMat.copy(this.worldMat).invert();
    this.normalMat.getNormalMatrix(this.worldMat);
    this.localCenter.copy(body.position).applyMatrix4(this.invMat);
    this.localAxisX.copy(this.axisX).transformDirection(this.invMat);
    this.localAxisY.copy(this.axisY).transformDirection(this.invMat);
    this.localAxisZ.copy(this.axisZ).transformDirection(this.invMat);
    this.computeOBBWorldAABB(body.position, this.worldAABB);
    this.localAABB.copy(this.worldAABB).applyMatrix4(this.invMat);
    const self = this;
    tree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(self.localAABB),
      intersectsTriangle: (tri) => {
        self.testTriangle(body, tri.a, tri.b, tri.c);
      }
    });
  }
  /** SAT 分离则丢弃；否则用支撑点投影出接触。 */
  testTriangle(body, a, b, c) {
    this.ab.subVectors(b, a);
    this.ac.subVectors(c, a);
    this.triN.copy(this.ab).cross(this.ac);
    if (this.triN.lengthSq() < 1e-12) return;
    this.triN.normalize();
    if (!this.tryAxis(this.triN, a, b, c)) return;
    if (!this.tryAxis(this.localAxisX, a, b, c)) return;
    if (!this.tryAxis(this.localAxisY, a, b, c)) return;
    if (!this.tryAxis(this.localAxisZ, a, b, c)) return;
    this.edge.subVectors(b, a);
    if (!this.tryCrossAxes(this.edge, a, b, c)) return;
    this.edge.subVectors(c, b);
    if (!this.tryCrossAxes(this.edge, a, b, c)) return;
    this.edge.subVectors(a, c);
    if (!this.tryCrossAxes(this.edge, a, b, c)) return;
    const radius = this.bodyHalf.x * Math.abs(this.triN.dot(this.localAxisX)) + this.bodyHalf.y * Math.abs(this.triN.dot(this.localAxisY)) + this.bodyHalf.z * Math.abs(this.triN.dot(this.localAxisZ));
    const plane = a.dot(this.triN);
    const depth = plane - (this.localCenter.dot(this.triN) - radius);
    if (depth <= -this.contactSkin) return;
    this.support.copy(this.localCenter).addScaledVector(this.localAxisX, -this.bodyHalf.x * Math.sign(this.triN.dot(this.localAxisX) || 1)).addScaledVector(this.localAxisY, -this.bodyHalf.y * Math.sign(this.triN.dot(this.localAxisY) || 1)).addScaledVector(this.localAxisZ, -this.bodyHalf.z * Math.sign(this.triN.dot(this.localAxisZ) || 1));
    closestPointOnTriangle(
      this.support,
      a,
      b,
      c,
      this.closest,
      this.ab,
      this.ac,
      this.ap,
      this.bp,
      this.cp
    );
    this.addRawContact(this.closest, this.triN, depth, body);
  }
  /** 用三角边与 OBB 轴的叉积做分离轴测试。 */
  tryCrossAxes(edge, a, b, c) {
    if (!this.tryAxis(this.testAxis.copy(edge).cross(this.localAxisX), a, b, c)) return false;
    if (!this.tryAxis(this.testAxis.copy(edge).cross(this.localAxisY), a, b, c)) return false;
    if (!this.tryAxis(this.testAxis.copy(edge).cross(this.localAxisZ), a, b, c)) return false;
    return true;
  }
  /** 沿一根轴投影 OBB 与三角，重叠则通过。 */
  tryAxis(axis, a, b, c) {
    const lenSq = axis.lengthSq();
    if (lenSq < 1e-10) {
      this.rangeB.max = Infinity;
      return true;
    }
    this.testAxis.copy(axis).multiplyScalar(1 / Math.sqrt(lenSq));
    this.projectOBB(this.testAxis, this.rangeA);
    const p0 = a.dot(this.testAxis);
    const p1 = b.dot(this.testAxis);
    const p2 = c.dot(this.testAxis);
    this.rangeB.min = Math.min(p0, p1, p2);
    const triMax = Math.max(p0, p1, p2);
    if (this.rangeA.max + this.contactSkin < this.rangeB.min || this.rangeA.min - this.contactSkin > triMax) return false;
    this.rangeB.max = Math.min(this.rangeA.max, triMax) - Math.max(this.rangeA.min, this.rangeB.min);
    return true;
  }
  /** 把 OBB 投影到指定轴，写出 min/max。 */
  projectOBB(axis, out) {
    const r = this.bodyHalf.x * Math.abs(axis.dot(this.localAxisX)) + this.bodyHalf.y * Math.abs(axis.dot(this.localAxisY)) + this.bodyHalf.z * Math.abs(axis.dot(this.localAxisZ));
    const c = this.localCenter.dot(axis);
    out.min = c - r;
    out.max = c + r;
  }
  /** 写入原始接触；槽满时替换最浅的一个。 */
  addRawContact(localPoint, localNormal, depth, body) {
    let slot = this.rawCount;
    if (slot === MAX_RAW) {
      let shallow = 0;
      for (let i = 1; i < MAX_RAW; i++) {
        if (this.raw[i].penetration < this.raw[shallow].penetration) shallow = i;
      }
      if (depth <= this.raw[shallow].penetration) return;
      slot = shallow;
    } else {
      this.rawCount += 1;
    }
    const contact = this.raw[slot];
    contact.point.copy(localPoint).applyMatrix4(this.worldMat);
    contact.normal.copy(localNormal).applyMatrix3(this.normalMat).normalize();
    this.toward.subVectors(body.position, contact.point);
    if (contact.normal.dot(this.toward) < 0) contact.normal.negate();
    contact.penetration = depth;
  }
  /** 从朝向取出世界轴，并缓存半边长。 */
  setWorldAxes(body) {
    this.setAxes(body.quaternion, this.axisX, this.axisY, this.axisZ);
    this.bodyHalf.copy(body.halfExtents);
  }
  /** 由四元数写出三个正交轴。 */
  setAxes(quat, x, y, z) {
    x.set(1, 0, 0).applyQuaternion(quat);
    y.set(0, 1, 0).applyQuaternion(quat);
    z.set(0, 0, 1).applyQuaternion(quat);
  }
  /** 由 8 个角点计算 OBB 世界 AABB。 */
  computeOBBWorldAABB(center, out) {
    out.makeEmpty();
    for (let i = 0; i < 8; i++) {
      this.cornerFrom(
        center,
        this.axisX,
        this.axisY,
        this.axisZ,
        i & 1 ? 1 : -1,
        i & 2 ? 1 : -1,
        i & 4 ? 1 : -1,
        this.corner
      );
      out.expandByPoint(this.corner);
    }
    out.expandByScalar(0.08);
  }
  /** 按轴向符号组合出 OBB 角点。 */
  cornerFrom(center, axisX, axisY, axisZ, sx, sy, sz, out) {
    return out.copy(center).addScaledVector(axisX, sx * this.bodyHalf.x).addScaledVector(axisY, sy * this.bodyHalf.y).addScaledVector(axisZ, sz * this.bodyHalf.z);
  }
};

// src/collision/contacts/ContactCache.ts
var MATCH_NORMAL = 0.95;
var MATCH_DISTANCE = 0.08;
var ContactCache = class {
  constructor() {
    this.prev = [];
  }
  // 上一帧流形快照
  /**
   * 将上一帧冲量拷到本帧对应接触点。
   * 无匹配、或支撑面 ↔ 墙面切换时清零，避免错误热启动。
   */
  match(manifolds) {
    for (const manifold of manifolds) {
      for (const point of manifold.contacts) {
        const prev = this.findMatch(manifold.normal, point);
        if (!prev) {
          point.resetImpulses();
          continue;
        }
        const prevClass = normalClass(prev.normal);
        const nextClass = normalClass(manifold.normal);
        if (prevClass === "support" && nextClass === "wall" || prevClass === "wall" && nextClass === "support") {
          point.resetImpulses();
          continue;
        }
        point.normalImpulse = prev.point.normalImpulse;
        point.tangentImpulse1 = prev.point.tangentImpulse1;
        point.tangentImpulse2 = prev.point.tangentImpulse2;
      }
    }
  }
  /** 深拷贝本帧流形与接触冲量，供下一帧 match。 */
  save(manifolds) {
    this.prev = manifolds.map((src) => {
      const copy = new ContactManifold();
      copy.normal.copy(src.normal);
      copy.normalSum.copy(src.normalSum);
      copy.contacts = src.contacts.map((p) => {
        const c = new ContactPoint();
        c.copyFrom(p);
        return c;
      });
      return copy;
    });
  }
  /**
   * 在上一帧中找法线接近且局部点最近的接触。
   * 用刚体局部坐标匹配，避免物体移动后面世界点对不上。
   */
  findMatch(normal, point) {
    let best = null;
    let bestDist = MATCH_DISTANCE * MATCH_DISTANCE;
    for (const manifold of this.prev) {
      if (manifold.normal.dot(normal) < MATCH_NORMAL) continue;
      for (const prev of manifold.contacts) {
        const d = prev.localPoint.distanceToSquared(point.localPoint);
        if (d < bestDist) {
          bestDist = d;
          best = { point: prev, normal: manifold.normal };
        }
      }
    }
    return best;
  }
};

// src/collision/solver/frictionConstraint.ts
import * as THREE7 from "three";
var DEFAULT_FRICTION = 0.6;
var _r = new THREE7.Vector3();
var _gcross = new THREE7.Vector3();
var _local = new THREE7.Vector3();
var _world = new THREE7.Vector3();
var _invQuat2 = new THREE7.Quaternion();
var _vel = new THREE7.Vector3();
var _impulse = new THREE7.Vector3();
function warmStartFriction(body, point) {
  if (point.tangentImpulse1 === 0 && point.tangentImpulse2 === 0) return;
  _impulse.copy(point.tangent1).multiplyScalar(point.tangentImpulse1);
  _impulse.addScaledVector(point.tangent2, point.tangentImpulse2);
  body.applyImpulseAtPoint(_impulse, point.worldPoint);
}
function solveFrictionConstraint(body, _manifold, point) {
  const mu = body.friction ?? DEFAULT_FRICTION;
  const maxF = mu * point.normalImpulse;
  if (maxF <= 1e-8) {
    point.tangentImpulse1 = 0;
    point.tangentImpulse2 = 0;
    return;
  }
  body.getVelocityAtPoint(point.worldPoint, _vel);
  const vt1 = _vel.dot(point.tangent1);
  const vt2 = _vel.dot(point.tangent2);
  const mass1 = effectiveMass(body, point.worldPoint, point.tangent1, _r, _gcross, _local, _world, _invQuat2);
  const mass2 = effectiveMass(body, point.worldPoint, point.tangent2, _r, _gcross, _local, _world, _invQuat2);
  const old1 = point.tangentImpulse1;
  const old2 = point.tangentImpulse2;
  point.tangentImpulse1 += mass1 > 0 ? -vt1 * mass1 : 0;
  point.tangentImpulse2 += mass2 > 0 ? -vt2 * mass2 : 0;
  const magSq = point.tangentImpulse1 * point.tangentImpulse1 + point.tangentImpulse2 * point.tangentImpulse2;
  const maxSq = maxF * maxF;
  if (magSq > maxSq && magSq > 1e-12) {
    const scale = maxF / Math.sqrt(magSq);
    point.tangentImpulse1 *= scale;
    point.tangentImpulse2 *= scale;
  }
  const d1 = point.tangentImpulse1 - old1;
  const d2 = point.tangentImpulse2 - old2;
  if (d1 === 0 && d2 === 0) return;
  _impulse.copy(point.tangent1).multiplyScalar(d1).addScaledVector(point.tangent2, d2);
  body.applyImpulseAtPoint(_impulse, point.worldPoint);
}

// src/collision/solver/normalConstraint.ts
import * as THREE8 from "three";
var PENETRATION_SLOP = 3e-3;
var PENETRATION_BIAS_FACTOR = 0.05;
var MAX_CORRECTION_VELOCITY = 0.04;
var SUPPORT_BIAS_Y = 0.5;
var RESTITUTION_THRESHOLD = 0.1;
var _r2 = new THREE8.Vector3();
var _gcross2 = new THREE8.Vector3();
var _local2 = new THREE8.Vector3();
var _world2 = new THREE8.Vector3();
var _invQuat3 = new THREE8.Quaternion();
var _vel2 = new THREE8.Vector3();
var _impulse2 = new THREE8.Vector3();
function contactScale(body) {
  const extent = body.characteristicExtent?.() ?? CONTACT_REF_EXTENT;
  return Math.max(1e-4, extent) / CONTACT_REF_EXTENT;
}
function prepareNormalConstraint(body, manifold, point, dt) {
  point.biasVelocity = 0;
  const scale = contactScale(body);
  body.getVelocityAtPoint(point.worldPoint, _vel2);
  const vn = _vel2.dot(manifold.normal);
  const e = body.restitution ?? 0;
  if (e > 0 && vn < -RESTITUTION_THRESHOLD * scale) {
    point.biasVelocity += -e * vn;
  }
  if (dt <= 1e-8) return;
  if (manifold.normal.y <= SUPPORT_BIAS_Y) return;
  const error = point.penetration - PENETRATION_SLOP * scale;
  if (error <= 0) return;
  point.biasVelocity += Math.min(
    error * PENETRATION_BIAS_FACTOR / dt,
    MAX_CORRECTION_VELOCITY * scale
  );
}
function warmStartNormal(body, manifold, point) {
  if (point.normalImpulse === 0) return;
  _impulse2.copy(manifold.normal).multiplyScalar(point.normalImpulse);
  body.applyImpulseAtPoint(_impulse2, point.worldPoint);
}
function solveNormalConstraint(body, manifold, point) {
  const n = manifold.normal;
  body.getVelocityAtPoint(point.worldPoint, _vel2);
  const vn = _vel2.dot(n);
  const mass = effectiveMass(body, point.worldPoint, n, _r2, _gcross2, _local2, _world2, _invQuat3);
  if (mass <= 0) return;
  const lambda = -(vn - point.biasVelocity) * mass;
  const old = point.normalImpulse;
  point.normalImpulse = Math.max(0, old + lambda);
  const applied = point.normalImpulse - old;
  if (applied === 0) return;
  _impulse2.copy(n).multiplyScalar(applied);
  body.applyImpulseAtPoint(_impulse2, point.worldPoint);
}

// src/collision/solver/ContactImpulseSolver.ts
var ContactImpulseSolver = class {
  constructor() {
    this.velocityIterations = 8;
    // 速度迭代次数
    this.warmStart = true;
  }
  // 是否复用上一帧冲量做热启动
  /**
   * 对单个刚体与一组流形做速度级求解。
   * 顺序：准备 bias → 热启动 → 交替解法向 / 摩擦。
   */
  solveVelocity(body, manifolds, dt) {
    if (!manifolds.length) return;
    for (const manifold of manifolds) {
      for (const point of manifold.contacts) {
        prepareNormalConstraint(body, manifold, point, dt);
      }
    }
    if (this.warmStart) {
      for (const manifold of manifolds) {
        for (const point of manifold.contacts) {
          warmStartNormal(body, manifold, point);
          warmStartFriction(body, point);
        }
      }
    }
    for (let i = 0; i < this.velocityIterations; i++) {
      for (const manifold of manifolds) {
        for (const point of manifold.contacts) {
          solveNormalConstraint(body, manifold, point);
          solveFrictionConstraint(body, manifold, point);
        }
      }
    }
  }
};

// src/utils/vehiclePhysics/VehicleWheel.ts
import * as THREE9 from "three";
var VehicleWheel = class {
  constructor() {
    this.connectionPoint = new THREE9.Vector3();
    // 悬挂与底盘的局部连接点
    this.direction = new THREE9.Vector3(0, -1, 0);
    // 悬挂方向（底盘局部）
    this.axle = new THREE9.Vector3(0, 0, -1);
    // 轮轴方向（底盘局部）
    this.radius = 0.3;
    // 轮胎半径
    this.restLength = 0.1;
    // 悬挂静止长度
    this.suspensionLength = 0.1;
    // 当前悬挂长度（夹在行程内）
    this.visualLength = 0.1;
    // 视觉悬挂长度，跟射线
    this.maxSuspensionTravel = 0.1;
    // 最大行程
    this.stiffness = 18;
    // 悬挂刚度（质量归一化）
    this.dampingCompression = 2.1;
    // 压缩阻尼
    this.dampingRelaxation = 2.5;
    // 回弹阻尼
    this.maxSuspensionForce = 6e3;
    // 最大悬挂力
    this.steering = 0;
    // 转向角
    this.engineForce = 0;
    // 驱动力
    this.brake = 0;
    // 制动力
    this.frictionSlip = 8;
    // 纵向抓地
    this.sideFrictionStiffness = 1;
    // 侧向摩擦
    this.rollInfluence = 0.12;
    // 侧向力对侧倾的影响
    this.isInContact = false;
    // 是否接地
    this.contactPoint = new THREE9.Vector3();
    // 接地点
    this.contactNormal = new THREE9.Vector3(0, 1, 0);
    // 接触法线
    this.contactMesh = null;
    // 本帧接地网格
    this.suspensionForce = 0;
    // 本帧悬挂力
    this.forwardImpulse = 0;
    // 纵向冲量
    this.sideImpulse = 0;
    // 侧向冲量
    this.rotation = 0;
    // 车轮自转角
    this.deltaRotation = 0;
    // 本帧自转增量
    this.hardPointWS = new THREE9.Vector3();
    // 连接点世界坐标
    this.directionWS = new THREE9.Vector3(0, -1, 0);
    // 悬挂方向（世界）
    this.axleWS = new THREE9.Vector3(0, 0, -1);
    // 轮轴（世界）
    this.forwardWS = new THREE9.Vector3(1, 0, 0);
    // 滚动前向（世界）
    this.sideWS = new THREE9.Vector3(0, 0, 1);
    // 侧向（世界）
    this.clippedInvContactDotSuspension = 1;
    // 法线与悬挂方向夹角修正
    this.suspensionRelativeVelocity = 0;
    // 沿悬挂方向的相对速度
    this.skidInfo = 1;
  }
  // 打滑系数，1 为未打滑
};

// src/utils/vehiclePhysics/BVHVehicleController.ts
var SIDE_DAMPING_RATE = 13;
var FWD_FACTOR = 0.5;
var SIDE_FACTOR = 1;
var BVHVehicleController = class {
  /** 绑定车身刚体，可选传入场景碰撞网格。 */
  constructor(chassis, collider) {
    // 车身刚体
    this.wheels = [];
    // 车轮列表
    this.collider = [];
    // 场景碰撞网格
    this.collision = new VehicleCollision();
    this.contactSolver = new ContactImpulseSolver();
    this.contactCache = new ContactCache();
    this.raycaster = new THREE10.Raycaster();
    this.prevPosition = new THREE10.Vector3();
    this.prevQuaternion = new THREE10.Quaternion();
    this.normalMat = new THREE10.Matrix3();
    this.steerAxis = new THREE10.Vector3();
    this.steerQuat = new THREE10.Quaternion();
    this.vel = new THREE10.Vector3();
    this.impulse = new THREE10.Vector3();
    this.r = new THREE10.Vector3();
    this.gcross = new THREE10.Vector3();
    this.local = new THREE10.Vector3();
    this.world = new THREE10.Vector3();
    this.invQuat = new THREE10.Quaternion();
    this.upWS = new THREE10.Vector3();
    this.sidePoint = new THREE10.Vector3();
    this.chassis = chassis;
    this.collider = this.toColliderList(collider);
    this.raycaster.firstHitOnly = true;
  }
  /** 设置场景碰撞网格。 */
  setCollider(collider) {
    this.collider = this.toColliderList(collider);
  }
  /** 返回车轮数量。 */
  numWheels() {
    return this.wheels.length;
  }
  // ==================== 轮子参数 ====================
  /** 添加车轮并写入悬挂几何。 */
  addWheel(chassisConnectionCs, directionCs, axleCs, suspensionRestLength, radius) {
    const wheel = new VehicleWheel();
    wheel.connectionPoint.copy(chassisConnectionCs);
    wheel.direction.copy(directionCs);
    wheel.axle.copy(axleCs);
    wheel.restLength = suspensionRestLength;
    wheel.suspensionLength = suspensionRestLength;
    wheel.visualLength = suspensionRestLength;
    wheel.maxSuspensionTravel = suspensionRestLength;
    wheel.radius = radius;
    this.wheels.push(wheel);
    return wheel;
  }
  /** 设置悬挂与底盘的局部连接点。 */
  setWheelChassisConnectionPointCs(i, value) {
    this.wheelAt(i)?.connectionPoint.copy(value);
  }
  /** 设置悬挂方向（底盘局部）。 */
  setWheelDirectionCs(i, value) {
    this.wheelAt(i)?.direction.copy(value);
  }
  /** 设置轮轴方向（底盘局部）。 */
  setWheelAxleCs(i, value) {
    this.wheelAt(i)?.axle.copy(value);
  }
  /** 设置悬挂静止长度。 */
  setWheelSuspensionRestLength(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.restLength = value;
  }
  /** 设置轮胎半径。 */
  setWheelRadius(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.radius = value;
  }
  /** 设置悬挂最大行程。 */
  setWheelMaxSuspensionTravel(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.maxSuspensionTravel = value;
  }
  /** 设置悬挂刚度。 */
  setWheelSuspensionStiffness(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.stiffness = value;
  }
  /** 设置压缩阻尼。 */
  setWheelSuspensionCompression(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.dampingCompression = value;
  }
  /** 设置回弹阻尼。 */
  setWheelSuspensionRelaxation(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.dampingRelaxation = value;
  }
  /** 设置最大悬挂力。 */
  setWheelMaxSuspensionForce(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.maxSuspensionForce = value;
  }
  /** 设置制动力。 */
  setWheelBrake(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.brake = value;
  }
  /** 设置转向角。 */
  setWheelSteering(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.steering = value;
  }
  /** 设置驱动力。 */
  setWheelEngineForce(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.engineForce = value;
  }
  /** 设置纵向抓地。 */
  setWheelFrictionSlip(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.frictionSlip = value;
  }
  /** 设置侧向摩擦。 */
  setWheelSideFrictionStiffness(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.sideFrictionStiffness = value;
  }
  /** 设置侧向力对侧倾的影响，0 为几乎不侧倾，1 为按真实触地点侧倾。 */
  setWheelRollInfluence(i, value) {
    const wheel = this.wheelAt(i);
    if (wheel) wheel.rollInfluence = value;
  }
  /** 读取转向角。 */
  wheelSteering(i) {
    return this.wheelAt(i)?.steering ?? null;
  }
  /** 读取是否接地。 */
  wheelIsInContact(i) {
    return this.wheelAt(i)?.isInContact ?? false;
  }
  /** 读取轮轴方向（底盘局部）。 */
  wheelAxleCs(i) {
    return this.wheelAt(i)?.axle ?? null;
  }
  /** 读取悬挂与底盘的局部连接点。 */
  wheelChassisConnectionPointCs(i) {
    return this.wheelAt(i)?.connectionPoint ?? null;
  }
  /** 读取当前悬挂长度。 */
  wheelSuspensionLength(i) {
    return this.wheelAt(i)?.suspensionLength ?? null;
  }
  /** 读取视觉悬挂长度。 */
  wheelVisualLength(i) {
    return this.wheelAt(i)?.visualLength ?? null;
  }
  /** 读取车轮自转角。 */
  wheelRotation(i) {
    return this.wheelAt(i)?.rotation ?? null;
  }
  /** 读取接地网格。 */
  wheelContactMesh(i) {
    return this.wheelAt(i)?.contactMesh ?? null;
  }
  // ==================== 仿真步进 ====================
  /** 推进一帧：悬挂与轮胎力 → 车身接触 → 积分 → CCD。 */
  updateVehicle(dt, collider) {
    if (collider !== void 0) this.collider = this.toColliderList(collider);
    const clampedDt = Math.max(0, dt);
    if (clampedDt === 0) return;
    this.prevPosition.copy(this.chassis.position);
    this.prevQuaternion.copy(this.chassis.quaternion);
    this.updateWheelTransforms();
    this.chassis.applyGravity(clampedDt);
    this.raycastWheels();
    this.solveSuspension();
    this.applySuspensionImpulses(clampedDt);
    this.solveFriction(clampedDt);
    const manifolds = this.collision.detect(this.chassis, this.collider);
    this.contactCache.match(manifolds);
    this.contactSolver.solveVelocity(this.chassis, manifolds, clampedDt);
    this.contactCache.save(manifolds);
    this.chassis.applyDamping(clampedDt);
    this.chassis.integrate(clampedDt);
    const positionManifolds = this.collision.detect(this.chassis, this.collider);
    this.contactCache.match(positionManifolds);
    this.contactSolver.solveVelocity(this.chassis, positionManifolds, clampedDt);
    this.contactCache.save(positionManifolds);
    if (this.collision.needsSwept(this.chassis, clampedDt)) {
      this.collision.solveSwept(
        this.chassis,
        this.collider,
        this.prevPosition,
        this.prevQuaternion
      );
    }
    this.updateWheelRotation(clampedDt);
  }
  /** 把单个网格或列表收成可遍历数组。 */
  toColliderList(collider) {
    if (!collider) return [];
    return Array.isArray(collider) ? collider : [collider];
  }
  /** 按索引取车轮，越界返回 undefined。 */
  wheelAt(i) {
    return this.wheels[i];
  }
  // 把悬挂连接点、方向和转向后的轮轴变到世界空间
  updateWheelTransforms() {
    const q = this.chassis.quaternion;
    for (const wheel of this.wheels) {
      wheel.hardPointWS.copy(wheel.connectionPoint).applyQuaternion(q).add(this.chassis.position);
      wheel.directionWS.copy(wheel.direction).applyQuaternion(q);
      this.steerAxis.copy(wheel.directionWS).negate();
      this.steerQuat.setFromAxisAngle(this.steerAxis, wheel.steering);
      wheel.axleWS.copy(wheel.axle).applyQuaternion(q).applyQuaternion(this.steerQuat);
    }
  }
  // ==================== 悬挂与摩擦 ====================
  // 沿悬挂方向射线检测接地
  raycastWheels() {
    const colliders = this.collider;
    for (const wheel of this.wheels) {
      wheel.isInContact = false;
      wheel.contactMesh = null;
      const rayLen = wheel.restLength + wheel.maxSuspensionTravel + wheel.radius;
      if (!colliders.length || rayLen <= 1e-6) {
        this.setWheelAirborne(wheel);
        continue;
      }
      const dirLen = wheel.directionWS.length();
      if (dirLen < 1e-8) {
        this.setWheelAirborne(wheel);
        continue;
      }
      this.impulse.copy(wheel.directionWS).multiplyScalar(1 / dirLen);
      this.raycaster.set(wheel.hardPointWS, this.impulse);
      this.raycaster.near = 0;
      this.raycaster.far = rayLen;
      const hits = this.raycaster.intersectObjects(colliders, false);
      const hit = hits[0];
      if (!hit) {
        this.setWheelAirborne(wheel);
        continue;
      }
      wheel.isInContact = true;
      wheel.contactMesh = hit.object.isMesh ? hit.object : null;
      wheel.contactPoint.copy(hit.point);
      if (hit.face) {
        this.normalMat.getNormalMatrix(hit.object.matrixWorld);
        wheel.contactNormal.copy(hit.face.normal).applyMatrix3(this.normalMat).normalize();
      } else {
        wheel.contactNormal.copy(wheel.directionWS).negate().normalize();
      }
      if (wheel.contactNormal.dot(wheel.directionWS) > 0) wheel.contactNormal.negate();
      const rawLength = hit.distance - wheel.radius;
      const minLen = Math.max(0, wheel.restLength - wheel.maxSuspensionTravel);
      const maxLen = wheel.restLength + wheel.maxSuspensionTravel;
      wheel.visualLength = rawLength;
      wheel.suspensionLength = Math.min(maxLen, Math.max(minLen, rawLength));
      const denom = wheel.contactNormal.dot(wheel.directionWS);
      this.chassis.getVelocityAtPoint(wheel.contactPoint, this.vel);
      const projVel = wheel.contactNormal.dot(this.vel);
      if (denom >= -0.1) {
        wheel.suspensionRelativeVelocity = 0;
        wheel.clippedInvContactDotSuspension = 10;
      } else {
        const inv = -1 / denom;
        wheel.suspensionRelativeVelocity = projVel * inv;
        wheel.clippedInvContactDotSuspension = inv;
      }
    }
  }
  // 离地时回到静止长度
  setWheelAirborne(wheel) {
    wheel.isInContact = false;
    wheel.contactMesh = null;
    wheel.suspensionLength = wheel.restLength;
    wheel.visualLength = wheel.restLength;
    wheel.suspensionRelativeVelocity = 0;
    wheel.contactNormal.copy(wheel.directionWS).negate().normalize();
    wheel.clippedInvContactDotSuspension = 1;
    wheel.suspensionForce = 0;
  }
  // 弹簧 + 压缩/回弹阻尼
  solveSuspension() {
    const chassisMass = this.chassis.mass();
    for (const wheel of this.wheels) {
      if (!wheel.isInContact) {
        wheel.suspensionForce = 0;
        continue;
      }
      const lengthDiff = wheel.restLength - wheel.suspensionLength;
      let force = wheel.stiffness * lengthDiff * wheel.clippedInvContactDotSuspension;
      const damping = wheel.suspensionRelativeVelocity < 0 ? wheel.dampingCompression : wheel.dampingRelaxation;
      force -= damping * wheel.suspensionRelativeVelocity;
      wheel.suspensionForce = Math.max(0, force * chassisMass);
    }
  }
  // 沿接触法线施加悬挂冲量；作用点用轮心，减少转向时接地点把车顶歪
  applySuspensionImpulses(dt) {
    for (const wheel of this.wheels) {
      if (!wheel.isInContact) continue;
      const force = Math.min(wheel.suspensionForce, wheel.maxSuspensionForce);
      this.impulse.copy(wheel.contactNormal).multiplyScalar(force * dt);
      this.chassis.applyImpulseAtPoint(this.impulse, wheel.hardPointWS);
    }
  }
  // 侧向抓地、驱动/制动，超出摩擦椭圆则打滑缩放
  solveFriction(dt) {
    let wheelsOnGround = 0;
    for (const wheel of this.wheels) {
      wheel.sideImpulse = 0;
      wheel.forwardImpulse = 0;
      wheel.skidInfo = 1;
      if (!wheel.isInContact) continue;
      wheelsOnGround += 1;
      wheel.sideWS.copy(wheel.axleWS);
      const proj = wheel.sideWS.dot(wheel.contactNormal);
      wheel.sideWS.addScaledVector(wheel.contactNormal, -proj);
      if (wheel.sideWS.lengthSq() < 1e-8) continue;
      wheel.sideWS.normalize();
      wheel.forwardWS.copy(wheel.contactNormal).cross(wheel.sideWS);
      if (wheel.forwardWS.lengthSq() < 1e-8) continue;
      wheel.forwardWS.normalize();
      this.chassis.getVelocityAtPoint(wheel.contactPoint, this.vel);
      const sideSpeed = wheel.sideWS.dot(this.vel);
      const mass = effectiveMass(
        this.chassis,
        wheel.contactPoint,
        wheel.sideWS,
        this.r,
        this.gcross,
        this.local,
        this.world,
        this.invQuat
      );
      const dampFactor = Math.min(
        1,
        (1 - Math.exp(-SIDE_DAMPING_RATE * dt)) * wheel.sideFrictionStiffness
      );
      wheel.sideImpulse = -dampFactor * sideSpeed * mass;
    }
    let sliding = false;
    for (const wheel of this.wheels) {
      if (!wheel.isInContact) continue;
      if (wheel.engineForce !== 0) {
        wheel.forwardImpulse = wheel.engineForce * dt;
      } else {
        const maxImpulse = wheel.brake;
        this.chassis.getVelocityAtPoint(wheel.contactPoint, this.vel);
        const fwdSpeed = wheel.forwardWS.dot(this.vel);
        const mass = effectiveMass(
          this.chassis,
          wheel.contactPoint,
          wheel.forwardWS,
          this.r,
          this.gcross,
          this.local,
          this.world,
          this.invQuat
        );
        const denom = Math.max(1, wheelsOnGround);
        wheel.forwardImpulse = Math.max(-maxImpulse, Math.min(maxImpulse, -fwdSpeed * mass / denom));
      }
      const maxImp = wheel.suspensionForce * dt * wheel.frictionSlip;
      const x = wheel.forwardImpulse * FWD_FACTOR;
      const y = wheel.sideImpulse * SIDE_FACTOR;
      const impulseSq = x * x + y * y;
      const maxImpSq = maxImp * maxImp;
      if (impulseSq > maxImpSq && impulseSq > 1e-12) {
        sliding = true;
        wheel.skidInfo *= maxImp / Math.sqrt(impulseSq);
      }
    }
    if (sliding) {
      for (const wheel of this.wheels) {
        if (wheel.skidInfo < 1) {
          wheel.forwardImpulse *= wheel.skidInfo;
          wheel.sideImpulse *= wheel.skidInfo;
        }
      }
    }
    this.upWS.set(0, 1, 0).applyQuaternion(this.chassis.quaternion);
    for (const wheel of this.wheels) {
      if (!wheel.isInContact) continue;
      if (wheel.forwardImpulse !== 0) {
        this.impulse.copy(wheel.forwardWS).multiplyScalar(wheel.forwardImpulse);
        this.chassis.applyImpulseAtPoint(this.impulse, wheel.hardPointWS);
      }
      if (wheel.sideImpulse !== 0) {
        this.impulse.copy(wheel.sideWS).multiplyScalar(wheel.sideImpulse);
        this.sidePoint.copy(wheel.contactPoint);
        this.r.subVectors(wheel.contactPoint, this.chassis.position);
        this.sidePoint.addScaledVector(this.upWS, -this.upWS.dot(this.r) * (1 - wheel.rollInfluence));
        this.chassis.applyImpulseAtPoint(this.impulse, this.sidePoint);
      }
    }
  }
  // 按接地点前向速度更新车轮自转
  updateWheelRotation(dt) {
    for (const wheel of this.wheels) {
      if (wheel.isInContact) {
        this.chassis.getVelocityAtPoint(wheel.hardPointWS, this.vel);
        const proj = wheel.forwardWS.dot(this.vel);
        wheel.deltaRotation = wheel.radius > 1e-6 ? -(proj * dt) / wheel.radius : 0;
        wheel.rotation += wheel.deltaRotation;
      } else {
        wheel.rotation += wheel.deltaRotation;
      }
      wheel.deltaRotation *= 0.99;
    }
  }
};

// src/utils/vehicleController.ts
var DEFAULT_WHEEL_PHYSICS = {
  suspensionStiffness: 18,
  suspensionCompression: 2.1,
  suspensionRelaxation: 2.5,
  maxSuspensionForce: 6e3,
  frictionSlip: 8,
  sideFrictionStiffness: 1,
  rollInfluence: 0.12
};
var DEFAULT_MAX_SUSPENSION_TRAVEL = 0.35;
var VISUAL_FOLLOW = 14;
var DEBUG_HIT_RADIUS_RATIO = 0.12;
var DEBUG_TICK_RADIUS_RATIO = 0.25;
function makeDebugLine(material, segments) {
  const geo = new THREE11.BufferGeometry();
  geo.setAttribute("position", new THREE11.BufferAttribute(new Float32Array(segments * 6), 3));
  const line = new THREE11.LineSegments(geo, material);
  line.frustumCulled = false;
  line.renderOrder = 20;
  return line;
}
function setSegment(attr, i, a, b) {
  const o = i * 6;
  attr.array[o] = a.x;
  attr.array[o + 1] = a.y;
  attr.array[o + 2] = a.z;
  attr.array[o + 3] = b.x;
  attr.array[o + 4] = b.y;
  attr.array[o + 5] = b.z;
}
function createVehicleController(chassisBody, wheels, wheelsInfo, physics = DEFAULT_WHEEL_PHYSICS) {
  const vehicle = new BVHVehicleController(chassisBody);
  const suspensionDirection = new THREE11.Vector3(0, -1, 0);
  wheelsInfo.forEach((wheel, index) => {
    vehicle.addWheel(wheel.position, suspensionDirection, wheel.axleCs, wheel.suspensionRestLength, wheel.radius);
    vehicle.setWheelChassisConnectionPointCs(index, wheel.position);
    vehicle.setWheelDirectionCs(index, suspensionDirection);
    vehicle.setWheelAxleCs(index, wheel.axleCs);
    vehicle.setWheelSuspensionRestLength(index, wheel.suspensionRestLength);
    vehicle.setWheelRadius(index, wheel.radius);
    vehicle.setWheelMaxSuspensionTravel(index, wheel.maxSuspensionTravel);
    vehicle.setWheelSuspensionStiffness(index, physics.suspensionStiffness);
    vehicle.setWheelSuspensionCompression(index, physics.suspensionCompression);
    vehicle.setWheelSuspensionRelaxation(index, physics.suspensionRelaxation);
    vehicle.setWheelMaxSuspensionForce(index, physics.maxSuspensionForce);
    vehicle.setWheelBrake(index, 0);
    vehicle.setWheelSteering(index, 0);
    vehicle.setWheelEngineForce(index, 0);
    vehicle.setWheelFrictionSlip(index, physics.frictionSlip);
    vehicle.setWheelSideFrictionStiffness(index, physics.sideFrictionStiffness);
    vehicle.setWheelRollInfluence(index, physics.rollInfluence);
  });
  const up = new THREE11.Vector3(0, 1, 0);
  const wheelSteeringQuat = new THREE11.Quaternion();
  const wheelRotationQuat = new THREE11.Quaternion();
  const visualLengthSmooth = new Array(wheels.length).fill(Number.NaN);
  const _from = new THREE11.Vector3();
  const _to = new THREE11.Vector3();
  const _dir = new THREE11.Vector3();
  const _tick = new THREE11.Vector3();
  const _rest = new THREE11.Vector3();
  const _a = new THREE11.Vector3();
  const _b = new THREE11.Vector3();
  const wheelRayDebug = new THREE11.Group();
  wheelRayDebug.name = "wheelRayDebug";
  wheelRayDebug.userData.excludeFromCollider = true;
  const wheelTravelDebug = new THREE11.Group();
  wheelTravelDebug.name = "wheelTravelDebug";
  wheelTravelDebug.userData.excludeFromCollider = true;
  const rayLines = [];
  const hitMarks = [];
  const travelLines = [];
  const hitGeo = new THREE11.SphereGeometry(1, 8, 6);
  const hitMat = new THREE11.MeshBasicMaterial({ color: 16777062, depthTest: false });
  const rayMatHit = new THREE11.LineBasicMaterial({ color: 6750054, depthTest: false });
  const rayMatMiss = new THREE11.LineBasicMaterial({ color: 16733525, depthTest: false });
  const travelMat = new THREE11.LineBasicMaterial({ color: 4508927, depthTest: false, transparent: true, opacity: 0.95 });
  for (let i = 0; i < wheels.length; i++) {
    const ray = makeDebugLine(rayMatHit, 1);
    rayLines.push(ray);
    wheelRayDebug.add(ray);
    const hit = new THREE11.Mesh(hitGeo, hitMat);
    hit.frustumCulled = false;
    hit.renderOrder = 21;
    hit.visible = false;
    hit.scale.setScalar(Math.max(1e-6, (wheelsInfo[i]?.radius ?? 0) * DEBUG_HIT_RADIUS_RATIO));
    hitMarks.push(hit);
    wheelRayDebug.add(hit);
    const travel = makeDebugLine(travelMat, 4);
    travelLines.push(travel);
    wheelTravelDebug.add(travel);
  }
  function updateWheelVisuals(delta = 1 / 60) {
    const follow = 1 - Math.exp(-VISUAL_FOLLOW * Math.max(0, delta));
    const showRays = wheelRayDebug.visible;
    const showTravel = wheelTravelDebug.visible;
    for (const [index, wheelObj] of wheels.entries()) {
      if (!wheelObj) continue;
      const wheelAxleCs = vehicle.wheelAxleCs(index) ?? new THREE11.Vector3(1, 0, 0);
      const connection = vehicle.wheelChassisConnectionPointCs(index)?.y ?? 0;
      const target = vehicle.wheelVisualLength(index) ?? vehicle.wheelSuspensionLength(index) ?? 0;
      const steering = vehicle.wheelSteering(index) ?? 0;
      const rotationRad = vehicle.wheelRotation(index) ?? 0;
      let length = target;
      if (Number.isFinite(visualLengthSmooth[index])) {
        length = visualLengthSmooth[index] + (target - visualLengthSmooth[index]) * follow;
      }
      visualLengthSmooth[index] = length;
      wheelObj.position.y = connection - length;
      wheelSteeringQuat.setFromAxisAngle(up, steering);
      wheelRotationQuat.setFromAxisAngle(wheelAxleCs, rotationRad);
      wheelObj.quaternion.copy(wheelSteeringQuat).multiply(wheelRotationQuat);
      if (showRays || showTravel) {
        const wheel = vehicle.wheels[index];
        if (wheel) updateWheelDebug(index, wheel, showRays, showTravel);
      }
    }
  }
  function updateWheelDebug(index, wheel, showRays, showTravel) {
    _dir.copy(wheel.direction);
    if (_dir.lengthSq() < 1e-12) _dir.set(0, -1, 0);
    else _dir.normalize();
    const rest = wheel.restLength;
    const travel = wheel.maxSuspensionTravel;
    const minLen = Math.max(0, rest - travel);
    const maxLen = rest + travel;
    const rayLen = rest + travel + wheel.radius;
    const conn = wheel.connectionPoint;
    if (showRays) {
      const ray = rayLines[index];
      _from.copy(conn);
      _to.copy(conn).addScaledVector(_dir, rayLen);
      const rayAttr = ray.geometry.getAttribute("position");
      setSegment(rayAttr, 0, _from, _to);
      rayAttr.needsUpdate = true;
      ray.geometry.computeBoundingSphere();
      ray.material = wheel.isInContact ? rayMatHit : rayMatMiss;
      const hit = hitMarks[index];
      if (wheel.isInContact) {
        const hitDist = Math.max(0, wheel.visualLength + wheel.radius);
        hit.position.copy(conn).addScaledVector(_dir, hitDist);
        hit.scale.setScalar(Math.max(1e-6, wheel.radius * DEBUG_HIT_RADIUS_RATIO));
        hit.visible = true;
      } else {
        hit.visible = false;
      }
    }
    if (showTravel) {
      const line = travelLines[index];
      _from.copy(conn).addScaledVector(_dir, minLen);
      _to.copy(conn).addScaledVector(_dir, maxLen);
      _tick.copy(wheel.axle);
      if (_tick.lengthSq() < 1e-12) _tick.set(1, 0, 0);
      else _tick.normalize();
      _tick.multiplyScalar(Math.max(1e-6, wheel.radius * DEBUG_TICK_RADIUS_RATIO));
      _rest.copy(conn).addScaledVector(_dir, rest);
      const attr = line.geometry.getAttribute("position");
      setSegment(attr, 0, _from, _to);
      setSegment(attr, 1, _a.copy(_from).sub(_tick), _b.copy(_from).add(_tick));
      setSegment(attr, 2, _a.copy(_to).sub(_tick), _b.copy(_to).add(_tick));
      setSegment(attr, 3, _a.copy(_rest).sub(_tick), _b.copy(_rest).add(_tick));
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }
  function destroy() {
    vehicle.wheels.length = 0;
    wheelRayDebug.removeFromParent();
    wheelTravelDebug.removeFromParent();
    for (const line of rayLines) line.geometry.dispose();
    for (const line of travelLines) line.geometry.dispose();
    hitGeo.dispose();
    hitMat.dispose();
    rayMatHit.dispose();
    rayMatMiss.dispose();
    travelMat.dispose();
  }
  return { vehicle, updateWheelVisuals, destroy, wheelRayDebug, wheelTravelDebug };
}

// src/utils/vehiclePhysics/VehicleRigidBody.ts
import * as THREE12 from "three";
var GRAVITY = 9.81;
var VehicleRigidBody = class {
  constructor(opts) {
    this.position = new THREE12.Vector3();
    // 世界位置
    this.quaternion = new THREE12.Quaternion();
    // 世界朝向
    this.linearVelocity = new THREE12.Vector3();
    // 线速度
    this.angularVelocity = new THREE12.Vector3();
    // 质量倒数
    this.inertia = new THREE12.Vector3();
    // 局部惯量对角元
    this.invInertia = new THREE12.Vector3();
    // 碰撞盒半边长
    this._r = new THREE12.Vector3();
    this._torque = new THREE12.Vector3();
    this._local = new THREE12.Vector3();
    this._world = new THREE12.Vector3();
    this._invQuat = new THREE12.Quaternion();
    this.position.copy(opts.position);
    this.halfExtents = opts.halfExtents.clone();
    this._mass = Math.max(1e-6, opts.mass);
    this.invMass = 1 / this._mass;
    this.linearDamping = opts.linearDamping ?? 0.05;
    this.angularDamping = opts.angularDamping ?? 0.5;
    this.gravityScale = opts.gravityScale ?? 1;
    this.setCuboidInertia(this._mass, this.halfExtents);
  }
  /** 按长方体质量分布设置惯量。 */
  setCuboidInertia(mass, half) {
    const w = half.x * 2;
    const h = half.y * 2;
    const d = half.z * 2;
    this.inertia.set(
      mass / 12 * (h * h + d * d),
      mass / 12 * (w * w + d * d),
      mass / 12 * (w * w + h * h)
    );
    this.invInertia.set(
      this.inertia.x > 1e-8 ? 1 / this.inertia.x : 0,
      this.inertia.y > 1e-8 ? 1 / this.inertia.y : 0,
      this.inertia.z > 1e-8 ? 1 / this.inertia.z : 0
    );
  }
  /** 读取线速度。 */
  linvel() {
    return this.linearVelocity;
  }
  /** 读取角速度。 */
  angvel() {
    return this.angularVelocity;
  }
  /** 设置线速度。 */
  setLinvel(v) {
    this.linearVelocity.set(v.x, v.y, v.z);
  }
  /** 设置角速度。 */
  setAngvel(v) {
    this.angularVelocity.set(v.x, v.y, v.z);
  }
  /** 读取世界位置。 */
  translation() {
    return this.position;
  }
  /** 读取世界朝向。 */
  rotation() {
    return this.quaternion;
  }
  /** 设置世界位置。 */
  setTranslation(v) {
    this.position.set(v.x, v.y, v.z);
  }
  /** 设置世界朝向。 */
  setRotation(q) {
    this.quaternion.set(q.x, q.y, q.z, q.w).normalize();
  }
  /** 读取质量。 */
  mass() {
    return this._mass;
  }
  /** 设置质量并按当前碰撞盒重算惯量。 */
  setMass(mass) {
    this._mass = Math.max(1e-6, mass);
    this.invMass = 1 / this._mass;
    this.setCuboidInertia(this._mass, this.halfExtents);
  }
  /** 设置碰撞盒半边长并按当前质量重算惯量。 */
  setHalfExtents(half) {
    this.halfExtents.copy(half);
    this.setCuboidInertia(this._mass, this.halfExtents);
  }
  /** 在质心施加冲量。 */
  applyImpulse(impulse) {
    this.linearVelocity.addScaledVector(impulse, this.invMass);
  }
  /** 在世界点施加冲量，同时产生角速度。 */
  applyImpulseAtPoint(impulse, contactPoint) {
    this.linearVelocity.addScaledVector(impulse, this.invMass);
    this._r.subVectors(contactPoint, this.position);
    this.angularVelocity.add(this.angularDeltaFromImpulse(impulse, this._r));
  }
  // 将冲量转为世界角速度增量：ω += R I⁻¹ Rᵀ (r × J)
  angularDeltaFromImpulse(impulse, r) {
    this._torque.copy(r).cross(impulse);
    this._invQuat.copy(this.quaternion).invert();
    this._local.copy(this._torque).applyQuaternion(this._invQuat);
    this._local.x *= this.invInertia.x;
    this._local.y *= this.invInertia.y;
    this._local.z *= this.invInertia.z;
    return this._world.copy(this._local).applyQuaternion(this.quaternion);
  }
  /** 读取世界点处的刚体速度。 */
  getVelocityAtPoint(point, out) {
    this._r.subVectors(point, this.position);
    return out.copy(this.linearVelocity).add(this._world.copy(this.angularVelocity).cross(this._r));
  }
  /** 施加重力。 */
  applyGravity(dt) {
    this.linearVelocity.y -= GRAVITY * this.gravityScale * dt;
  }
  /** 施加线/角阻尼。 */
  applyDamping(dt) {
    const lin = Math.exp(-this.linearDamping * dt);
    const ang = Math.exp(-this.angularDamping * dt);
    this.linearVelocity.multiplyScalar(lin);
    this.angularVelocity.multiplyScalar(ang);
  }
  /** 用当前速度积分位置和朝向。 */
  integrate(dt) {
    this.position.addScaledVector(this.linearVelocity, dt);
    integrateQuaternion(this.quaternion, this.angularVelocity, dt);
  }
};

// src/utils/bbox.ts
import * as THREE13 from "three";
var _vertex = new THREE13.Vector3();
function getBbox(object) {
  object.updateMatrixWorld(true);
  const bbox = new THREE13.Box3();
  object.traverse((child) => {
    const geometry = child.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return;
    const matrixWorld = child.matrixWorld;
    for (let i = 0, n = position.count; i < n; i++) {
      _vertex.fromBufferAttribute(position, i).applyMatrix4(matrixWorld);
      bbox.expandByPoint(_vertex);
    }
  });
  const center = new THREE13.Vector3();
  const size = new THREE13.Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);
  return { bbox, center, size };
}

// src/utils/vehicleLoader.ts
var MIN_BOX_HEIGHT = 1e-3;
function mergeOpts(base, over) {
  return over ? { ...base, ...over } : { ...base };
}
async function loadVehicleModel(opts, ctx) {
  const { loader, scene, vehicleParams, vehicleLength } = ctx;
  const scale = opts.scale ?? 1;
  const debug = mergeOpts(vehicleParams.debug, opts.debug);
  const chassis = mergeOpts(vehicleParams.chassis, opts.chassis);
  const power = mergeOpts(vehicleParams.power, opts.power);
  const steering = mergeOpts(vehicleParams.steering, opts.steering);
  const grip = mergeOpts(vehicleParams.grip, opts.grip);
  const sus = mergeOpts(vehicleParams.suspension, opts.suspension);
  const density = Math.max(1e-8, chassis.density);
  const linearDamping = chassis.linearDamping;
  const angularDamping = chassis.angularDamping;
  const maxSpeed = power.maxSpeed * scale;
  const acceleration = power.acceleration * scale;
  const deceleration = power.deceleration * scale;
  const followVehicleDirection = opts.followVehicleDirection ?? vehicleParams.followVehicleDirection;
  let model;
  if (opts.model) {
    model = opts.model;
  } else {
    const gltf = await loader.loadAsync(opts.url);
    model = gltf.scene;
  }
  const { size: originalSize } = getBbox(model);
  const modelScale = vehicleLength / Math.max(originalSize.x, originalSize.y, originalSize.z);
  const wheelObjects = [];
  for (const name of opts.wheelsNames) {
    let found = false;
    model.traverse((child) => {
      if (child.name === name && !found) {
        wheelObjects.push(child);
        found = true;
      }
    });
    if (!found) console.warn(`\u672A\u627E\u5230\u8F6E\u5B50: ${name}`);
  }
  const tempGroup = new THREE14.Group();
  scene.add(tempGroup);
  model.scale.multiplyScalar(modelScale * scale);
  model.rotateY(opts.modelRotation ?? vehicleParams.model.rotation);
  const { center } = getBbox(model);
  model.position.set(-center.x, -center.y, -center.z);
  tempGroup.add(model);
  tempGroup.updateMatrixWorld(true);
  let wheelRadius = 0, wheelSizeInit = false;
  const wheelsInfo = [];
  for (const wheel of wheelObjects) {
    const worldPos = new THREE14.Vector3();
    const worldQuat = new THREE14.Quaternion();
    const worldScale = new THREE14.Vector3();
    wheel.getWorldPosition(worldPos);
    wheel.getWorldQuaternion(worldQuat);
    wheel.getWorldScale(worldScale);
    if (!wheelSizeInit) {
      const { size: ws } = getBbox(wheel);
      wheelRadius = Math.max(ws.x, ws.y, ws.z) / 2;
      wheelSizeInit = true;
    }
    wheelsInfo.push({
      axleCs: new THREE14.Vector3(0, 0, -1),
      position: worldPos,
      quaternion: worldQuat,
      scale: worldScale,
      radius: wheelRadius,
      object: wheel
    });
  }
  tempGroup.remove(model);
  scene.remove(tempGroup);
  if (wheelsInfo.length !== 4) {
    throw new Error(`\u8F66\u8F86\u9700\u8981 4 \u4E2A\u6709\u6548\u8F66\u8F6E\u8282\u70B9,\u5F53\u524D\u627E\u5230 ${wheelsInfo.length} \u4E2A`);
  }
  const vehicleGroup = new THREE14.Group();
  scene.add(vehicleGroup);
  vehicleGroup.add(model);
  vehicleGroup.updateMatrixWorld(true);
  const wheelWrappers = [];
  for (let i = 0; i < wheelsInfo.length; i++) {
    const wheel = wheelsInfo[i];
    const wheelWrapper = new THREE14.Group();
    wheelWrapper.position.copy(vehicleGroup.worldToLocal(wheel.position.clone()));
    const wheelObj = wheel.object;
    wheelObj.parent?.remove(wheelObj);
    wheelObj.position.set(0, 0, 0);
    wheelObj.quaternion.copy(wheel.quaternion);
    wheelObj.scale.copy(wheel.scale);
    wheelObj.updateMatrixWorld();
    wheelWrapper.add(wheelObj);
    vehicleGroup.add(wheelWrapper);
    wheelWrappers.push(wheelWrapper);
  }
  const shiftContent = (offset) => {
    model.position.sub(offset);
    for (const wrapper of wheelWrappers) wrapper.position.sub(offset);
  };
  vehicleGroup.updateMatrixWorld(true);
  const { center: bodyCenter, size: bodySize } = getBbox(model);
  shiftContent(vehicleGroup.worldToLocal(bodyCenter.clone()));
  vehicleGroup.updateMatrixWorld(true);
  const { bbox: bodyBbox } = getBbox(model);
  const localMin = vehicleGroup.worldToLocal(bodyBbox.min.clone());
  const localMax = vehicleGroup.worldToLocal(bodyBbox.max.clone());
  let minTireBottom = Infinity;
  let minHubY = Infinity;
  for (const wrapper of wheelWrappers) {
    minHubY = Math.min(minHubY, wrapper.position.y);
    minTireBottom = Math.min(minTireBottom, wrapper.position.y - wheelRadius);
  }
  let boxTop = localMax.y;
  const chassisTopClearance = (boxTop - minTireBottom) / Math.max(scale, 1e-8);
  let boxBottom = Math.min(localMin.y, minHubY);
  if (opts.chassis?.clearance != null) {
    boxBottom = minTireBottom + opts.chassis.clearance * scale;
    boxBottom = Math.max(boxBottom, minTireBottom);
  }
  if (boxBottom > boxTop - MIN_BOX_HEIGHT) boxBottom = boxTop - MIN_BOX_HEIGHT;
  const chassisClearance = (boxBottom - minTireBottom) / Math.max(scale, 1e-8);
  const sizeScale = chassis.sizeScale;
  const sx = Math.max(1e-3, sizeScale?.x ?? 1);
  const sy = Math.max(1e-3, sizeScale?.y ?? 1);
  const sz = Math.max(1e-3, sizeScale?.z ?? 1);
  const boxHeight = Math.max(MIN_BOX_HEIGHT, (boxTop - boxBottom) * sy);
  boxTop = boxBottom + boxHeight;
  const boxCenterY = (boxTop + boxBottom) * 0.5;
  if (Math.abs(boxCenterY) > 1e-8) {
    shiftContent(new THREE14.Vector3(0, boxCenterY, 0));
    vehicleGroup.updateMatrixWorld(true);
  }
  const stiffness = sus.stiffness ?? DEFAULT_WHEEL_PHYSICS.suspensionStiffness;
  const staticSag = 9.81 * scale / (4 * Math.max(1e-4, stiffness));
  const restLengthOpt = sus.restLength;
  const restFromOptOrWheel = restLengthOpt != null ? restLengthOpt * scale : wheelRadius * 2 * 0.2;
  const suspensionRestLength = Math.max(restFromOptOrWheel, staticSag * 1.2);
  const maxSuspensionTravel = (sus.maxTravel ?? DEFAULT_MAX_SUSPENSION_TRAVEL) * scale;
  const rollInfluence = sus.rollInfluence ?? DEFAULT_WHEEL_PHYSICS.rollInfluence;
  for (let i = 0; i < wheelsInfo.length; i++) {
    wheelsInfo[i].position = wheelWrappers[i].position.clone();
    wheelsInfo[i].suspensionRestLength = suspensionRestLength;
    wheelsInfo[i].maxSuspensionTravel = maxSuspensionTravel;
    wheelsInfo[i].radius = wheelRadius;
  }
  const frontCenter = wheelWrappers[0].position.clone().add(wheelWrappers[1].position).multiplyScalar(0.5);
  const rearCenter = wheelWrappers[2].position.clone().add(wheelWrappers[3].position).multiplyScalar(0.5);
  const forwardLocal = frontCenter.sub(rearCenter);
  forwardLocal.y = 0;
  if (forwardLocal.lengthSq() < 1e-8) forwardLocal.set(1, 0, 0);
  else forwardLocal.normalize();
  const halfExtents = new THREE14.Vector3(
    bodySize.x * 0.5 * sx,
    boxHeight * 0.5,
    bodySize.z * 0.5 * sz
  );
  const volume = 8 * halfExtents.x * halfExtents.y * halfExtents.z;
  const mass = volume * density;
  minTireBottom = Infinity;
  for (const wrapper of wheelWrappers) {
    minTireBottom = Math.min(minTireBottom, wrapper.position.y - wheelRadius);
  }
  const spawnPosition = opts.position.clone();
  spawnPosition.y -= minTireBottom;
  const chassisBody = new VehicleRigidBody({
    position: spawnPosition,
    mass,
    halfExtents,
    linearDamping,
    angularDamping,
    gravityScale: scale
  });
  const physicsBoxMesh = new THREE14.Mesh(
    new THREE14.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
    new THREE14.MeshBasicMaterial({ color: 16777215, wireframe: true, transparent: true, opacity: 0.3 })
  );
  physicsBoxMesh.userData.excludeFromCollider = true;
  if (debug.showPhysicsBox) vehicleGroup.add(physicsBoxMesh);
  vehicleGroup.position.copy(spawnPosition);
  vehicleGroup.updateMatrixWorld(true);
  const wheelPhysics = {
    suspensionStiffness: sus.stiffness ?? DEFAULT_WHEEL_PHYSICS.suspensionStiffness,
    suspensionCompression: sus.compression ?? DEFAULT_WHEEL_PHYSICS.suspensionCompression,
    suspensionRelaxation: sus.relaxation ?? DEFAULT_WHEEL_PHYSICS.suspensionRelaxation,
    maxSuspensionForce: sus.maxForce ?? DEFAULT_WHEEL_PHYSICS.maxSuspensionForce,
    frictionSlip: sus.frictionSlip ?? DEFAULT_WHEEL_PHYSICS.frictionSlip,
    sideFrictionStiffness: sus.sideFrictionStiffness ?? DEFAULT_WHEEL_PHYSICS.sideFrictionStiffness,
    rollInfluence
  };
  const { vehicle, updateWheelVisuals, destroy, wheelRayDebug, wheelTravelDebug } = createVehicleController(
    chassisBody,
    wheelWrappers,
    wheelsInfo,
    wheelPhysics
  );
  vehicleGroup.add(wheelRayDebug);
  vehicleGroup.add(wheelTravelDebug);
  wheelRayDebug.visible = debug.showWheelRays;
  wheelTravelDebug.visible = debug.showWheelTravel;
  return {
    vehicleGroup,
    chassisBody,
    vehicleController: vehicle,
    updateWheelVisuals,
    destroyVehicleController: destroy,
    scale,
    driverSeatPosition: opts.driverSeatPosition.clone(),
    driverSeatRotation: opts.driverSeatRotation ?? 0,
    forwardLocal,
    sideFrictionStiffness: wheelPhysics.sideFrictionStiffness,
    steering,
    grip,
    size: { l: Math.max(bodySize.x, bodySize.z), w: Math.min(bodySize.x, bodySize.z), h: bodySize.y },
    halfExtents,
    chassisClearance,
    chassisTopClearance,
    chassisSizeScaleX: sx,
    chassisSizeScaleY: sy,
    chassisSizeScaleZ: sz,
    maxSpeed,
    acceleration,
    deceleration,
    followVehicleDirection,
    physicsBoxMesh,
    wheelRayDebug,
    wheelTravelDebug
  };
}

// src/utils/capsuleCollision.ts
import * as THREE15 from "three";
function createCollisionTemps() {
  return {
    invMat: new THREE15.Matrix4(),
    localSeg: new THREE15.Line3(),
    localBox: new THREE15.Box3(),
    closestSeg: new THREE15.Vector3(),
    closestTri: new THREE15.Vector3()
  };
}
function createGroundProbeQuery() {
  return {
    start: new THREE15.Vector3(),
    down: new THREE15.Vector3(0, -1, 0),
    maxDistance: 0,
    radius: 0,
    radiusSq: 0,
    minNormalY: 0,
    delta: new THREE15.Vector3(),
    radialOffset: new THREE15.Vector3(),
    hit: {
      point: new THREE15.Vector3(),
      normal: new THREE15.Vector3(),
      distance: Infinity
    }
  };
}
function resetGroundProbeQuery(query, start, down, maxDistance, radius, minNormalY) {
  query.start.copy(start);
  query.down.copy(down).normalize();
  query.maxDistance = Math.max(0, maxDistance);
  query.radius = Math.max(0, radius);
  query.radiusSq = query.radius * query.radius;
  query.minNormalY = minNormalY;
  query.hit.distance = Infinity;
}
function tryGroundProbeCandidate(query, point, normal) {
  query.delta.subVectors(point, query.start);
  const distance = query.delta.dot(query.down);
  if (distance < -1e-5 || distance > query.maxDistance + 1e-5 || distance >= query.hit.distance) return false;
  query.radialOffset.copy(query.delta).addScaledVector(query.down, -distance);
  if (query.radialOffset.lengthSq() > query.radiusSq) return false;
  if (-normal.dot(query.down) < query.minNormalY) return false;
  query.hit.distance = distance;
  query.hit.point.copy(point);
  query.hit.normal.copy(normal);
  return true;
}
function tryGroundProbeTriangle(query, segment, triangle, trianglePoint, segmentPoint, normal, pointMatrix, normalMatrix) {
  triangle.closestPointToSegment(segment, trianglePoint, segmentPoint);
  if (pointMatrix) trianglePoint.applyMatrix4(pointMatrix);
  triangle.getNormal(normal);
  if (normalMatrix) normal.applyMatrix3(normalMatrix);
  normal.normalize();
  return tryGroundProbeCandidate(query, trianglePoint, normal);
}
function createGroundProbeTemps() {
  return {
    invMat: new THREE15.Matrix4(),
    normalMat: new THREE15.Matrix3(),
    localSeg: new THREE15.Line3(),
    localBox: new THREE15.Box3(),
    colliderScale: new THREE15.Vector3(),
    localTriPoint: new THREE15.Vector3(),
    localSegPoint: new THREE15.Vector3(),
    localNormal: new THREE15.Vector3(),
    query: createGroundProbeQuery()
  };
}
function probeMeshGround(sensorStart, down, maxDistance, sensorRadius, minNormalY, collider, temps) {
  const boundsTree = collider.geometry?.boundsTree;
  if (!boundsTree || maxDistance <= 0 || sensorRadius <= 0 || down.lengthSq() === 0) return null;
  resetGroundProbeQuery(
    temps.query,
    sensorStart,
    down,
    maxDistance,
    sensorRadius,
    minNormalY
  );
  temps.invMat.copy(collider.matrixWorld).invert();
  temps.normalMat.getNormalMatrix(collider.matrixWorld);
  temps.localSeg.start.copy(temps.query.start).applyMatrix4(temps.invMat);
  temps.localSeg.end.copy(temps.query.start).addScaledVector(temps.query.down, temps.query.maxDistance).applyMatrix4(temps.invMat);
  temps.colliderScale.setFromMatrixScale(collider.matrixWorld);
  const minScale = Math.max(
    1e-8,
    Math.min(temps.colliderScale.x, temps.colliderScale.y, temps.colliderScale.z)
  );
  const localRadius = sensorRadius / minScale;
  temps.localBox.makeEmpty().expandByPoint(temps.localSeg.start).expandByPoint(temps.localSeg.end).expandByScalar(localRadius);
  boundsTree.shapecast({
    intersectsBounds: (box) => box.intersectsBox(temps.localBox),
    intersectsTriangle: (tri) => {
      tryGroundProbeTriangle(
        temps.query,
        temps.localSeg,
        tri,
        temps.localTriPoint,
        temps.localSegPoint,
        temps.localNormal,
        collider.matrixWorld,
        temps.normalMat
      );
    }
  });
  return Number.isFinite(temps.query.hit.distance) ? temps.query.hit : null;
}
function applyCapsuleCollision(capsule, capsuleInfo, collider, temps, skipTri, useDynamicsSegment = false) {
  const segment = useDynamicsSegment ? capsuleInfo.dynamicsSegment ?? capsuleInfo.segment : capsuleInfo.segment;
  temps.invMat.copy(collider.matrixWorld).invert();
  temps.localSeg.start.copy(segment.start).applyMatrix4(capsule.matrixWorld).applyMatrix4(temps.invMat);
  temps.localSeg.end.copy(segment.end).applyMatrix4(capsule.matrixWorld).applyMatrix4(temps.invMat);
  temps.localBox.makeEmpty();
  temps.localBox.expandByPoint(temps.localSeg.start).expandByPoint(temps.localSeg.end);
  temps.localBox.expandByScalar(capsuleInfo.radius);
  collider.geometry?.boundsTree?.shapecast({
    intersectsBounds: (box) => box.intersectsBox(temps.localBox),
    intersectsTriangle: (tri) => {
      const distance = tri.closestPointToSegment(temps.localSeg, temps.closestSeg, temps.closestTri);
      if (distance >= capsuleInfo.radius) return;
      const dir = temps.closestTri.clone().sub(temps.closestSeg).normalize();
      if (skipTri?.(tri, dir)) return;
      temps.localSeg.start.addScaledVector(dir, capsuleInfo.radius - distance);
      temps.localSeg.end.addScaledVector(dir, capsuleInfo.radius - distance);
    }
  });
  const newPos = temps.closestSeg.copy(temps.localSeg.start).applyMatrix4(collider.matrixWorld);
  const delta = temps.closestTri.subVectors(newPos, capsule.position);
  const offset = Math.max(0, delta.length() - 1e-5);
  capsule.position.add(delta.normalize().multiplyScalar(offset));
}
function capsuleSphereOverlap(capsule, capsuleInfo, spherePos, sphereRadius, temps) {
  const segment = capsuleInfo.dynamicsSegment ?? capsuleInfo.segment;
  temps.localSeg.start.copy(segment.start).applyMatrix4(capsule.matrixWorld);
  temps.localSeg.end.copy(segment.end).applyMatrix4(capsule.matrixWorld);
  temps.localSeg.closestPointToPoint(spherePos, true, temps.closestSeg);
  temps.closestTri.subVectors(spherePos, temps.closestSeg);
  const dist = temps.closestTri.length();
  const minDist = capsuleInfo.radius + sphereRadius;
  if (dist >= minDist) return 0;
  if (dist > 1e-8) temps.closestTri.multiplyScalar(1 / dist);
  else temps.closestTri.set(0, 1, 0);
  return minDist - dist;
}

// src/collision/groups.ts
var CollisionGroup = {
  ALL: 65535,
  /** 场景静态 / 运动学网格等默认层。 */
  DEFAULT: 1 << 0,
  /** 人物相关（预留）。 */
  CHARACTER: 1 << 1,
  /** 车辆底盘盒。 */
  VEHICLE: 1 << 2,
  /** 动态碎片（球等）。 */
  DEBRIS: 1 << 3
};
var CHARACTER_QUERY_MASK = CollisionGroup.DEFAULT;
var ALL_COLLISION_MASK = CollisionGroup.ALL;

// src/collision/obbObb.ts
import * as THREE16 from "three";
var EPS2 = 1e-8;
var AXIS_EPS = 1e-10;
var BAUMGARTE = 0.8;
var RESTITUTION = 0.2;
var FRICTION = 0.4;
function createObbObbTemps() {
  return {
    ax: new THREE16.Vector3(),
    ay: new THREE16.Vector3(),
    az: new THREE16.Vector3(),
    bx: new THREE16.Vector3(),
    by: new THREE16.Vector3(),
    bz: new THREE16.Vector3(),
    axis: new THREE16.Vector3(),
    bestN: new THREE16.Vector3(),
    tangent: new THREE16.Vector3(),
    invQuatA: new THREE16.Quaternion(),
    invQuatB: new THREE16.Quaternion(),
    local: new THREE16.Vector3(),
    supportA: new THREE16.Vector3(),
    supportB: new THREE16.Vector3(),
    contact: new THREE16.Vector3(),
    velA: new THREE16.Vector3(),
    velB: new THREE16.Vector3(),
    rel: new THREE16.Vector3(),
    impulse: new THREE16.Vector3(),
    r: new THREE16.Vector3(),
    gcross: new THREE16.Vector3(),
    localI: new THREE16.Vector3(),
    worldI: new THREE16.Vector3(),
    invQuat: new THREE16.Quaternion()
  };
}
function radiusOnAxis(ax, ay, az, half, n) {
  return half.x * Math.abs(n.dot(ax)) + half.y * Math.abs(n.dot(ay)) + half.z * Math.abs(n.dot(az));
}
function supportPoint(pos, quat, invQuat, half, dir, local, out) {
  local.copy(dir).applyQuaternion(invQuat);
  out.set(
    Math.sign(local.x) * half.x,
    Math.sign(local.y) * half.y,
    Math.sign(local.z) * half.z
  );
  return out.applyQuaternion(quat).add(pos);
}
function resolveObbObb(a, b, temps) {
  temps.ax.set(1, 0, 0).applyQuaternion(a.quaternion);
  temps.ay.set(0, 1, 0).applyQuaternion(a.quaternion);
  temps.az.set(0, 0, 1).applyQuaternion(a.quaternion);
  temps.bx.set(1, 0, 0).applyQuaternion(b.quaternion);
  temps.by.set(0, 1, 0).applyQuaternion(b.quaternion);
  temps.bz.set(0, 0, 1).applyQuaternion(b.quaternion);
  let minOverlap = Infinity;
  const tryAxis = (x, y, z) => {
    temps.axis.set(x, y, z);
    const lenSq = temps.axis.lengthSq();
    if (lenSq < AXIS_EPS) return true;
    temps.axis.multiplyScalar(1 / Math.sqrt(lenSq));
    const overlap = radiusOnAxis(temps.ax, temps.ay, temps.az, a.halfExtents, temps.axis) + radiusOnAxis(temps.bx, temps.by, temps.bz, b.halfExtents, temps.axis) - Math.abs(temps.axis.dot(temps.rel.subVectors(b.position, a.position)));
    if (overlap <= EPS2) return false;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      temps.bestN.copy(temps.axis);
      if (temps.bestN.dot(temps.rel) < 0) temps.bestN.negate();
    }
    return true;
  };
  if (!tryAxis(temps.ax.x, temps.ax.y, temps.ax.z)) return false;
  if (!tryAxis(temps.ay.x, temps.ay.y, temps.ay.z)) return false;
  if (!tryAxis(temps.az.x, temps.az.y, temps.az.z)) return false;
  if (!tryAxis(temps.bx.x, temps.bx.y, temps.bx.z)) return false;
  if (!tryAxis(temps.by.x, temps.by.y, temps.by.z)) return false;
  if (!tryAxis(temps.bz.x, temps.bz.y, temps.bz.z)) return false;
  temps.axis.copy(temps.ax).cross(temps.bx);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.ax).cross(temps.by);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.ax).cross(temps.bz);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.ay).cross(temps.bx);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.ay).cross(temps.by);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.ay).cross(temps.bz);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.az).cross(temps.bx);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.az).cross(temps.by);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  temps.axis.copy(temps.az).cross(temps.bz);
  if (!tryAxis(temps.axis.x, temps.axis.y, temps.axis.z)) return false;
  if (!Number.isFinite(minOverlap)) return false;
  const minHalf = Math.min(
    a.halfExtents.x,
    a.halfExtents.y,
    a.halfExtents.z,
    b.halfExtents.x,
    b.halfExtents.y,
    b.halfExtents.z
  );
  const depth = Math.min(minOverlap, minHalf * 2) * BAUMGARTE;
  const invSum = a.invMass + b.invMass;
  if (invSum <= EPS2 || depth <= EPS2) return false;
  temps.invQuatA.copy(a.quaternion).invert();
  temps.invQuatB.copy(b.quaternion).invert();
  supportPoint(a.position, a.quaternion, temps.invQuatA, a.halfExtents, temps.bestN, temps.local, temps.supportA);
  supportPoint(b.position, b.quaternion, temps.invQuatB, b.halfExtents, temps.rel.copy(temps.bestN).negate(), temps.local, temps.supportB);
  temps.contact.copy(temps.supportA).add(temps.supportB).multiplyScalar(0.5);
  a.position.addScaledVector(temps.bestN, -depth * (a.invMass / invSum));
  b.position.addScaledVector(temps.bestN, depth * (b.invMass / invSum));
  a.getVelocityAtPoint(temps.contact, temps.velA);
  b.getVelocityAtPoint(temps.contact, temps.velB);
  const relN = temps.velB.dot(temps.bestN) - temps.velA.dot(temps.bestN);
  if (relN >= 0) return true;
  const denomN = impulseDenominator(a, temps.contact, temps.bestN, temps.r, temps.gcross, temps.localI, temps.worldI, temps.invQuat) + impulseDenominator(b, temps.contact, temps.bestN, temps.r, temps.gcross, temps.localI, temps.worldI, temps.invQuat);
  if (denomN <= EPS2) return true;
  const jn = -(1 + RESTITUTION) * relN / denomN;
  temps.impulse.copy(temps.bestN).multiplyScalar(-jn);
  a.applyImpulseAtPoint(temps.impulse, temps.contact);
  temps.impulse.copy(temps.bestN).multiplyScalar(jn);
  b.applyImpulseAtPoint(temps.impulse, temps.contact);
  a.getVelocityAtPoint(temps.contact, temps.velA);
  b.getVelocityAtPoint(temps.contact, temps.velB);
  temps.rel.subVectors(temps.velA, temps.velB);
  temps.rel.addScaledVector(temps.bestN, -temps.rel.dot(temps.bestN));
  const tLen = temps.rel.length();
  if (tLen <= EPS2) return true;
  temps.tangent.copy(temps.rel).multiplyScalar(1 / tLen);
  const denomT = impulseDenominator(a, temps.contact, temps.tangent, temps.r, temps.gcross, temps.localI, temps.worldI, temps.invQuat) + impulseDenominator(b, temps.contact, temps.tangent, temps.r, temps.gcross, temps.localI, temps.worldI, temps.invQuat);
  if (denomT <= EPS2) return true;
  let jt = -tLen / denomT;
  const maxF = FRICTION * Math.abs(jn);
  jt = Math.max(-maxF, Math.min(maxF, jt));
  temps.impulse.copy(temps.tangent).multiplyScalar(jt);
  a.applyImpulseAtPoint(temps.impulse, temps.contact);
  temps.impulse.negate();
  b.applyImpulseAtPoint(temps.impulse, temps.contact);
  return true;
}

// src/systems/VehicleSystem.ts
var VehicleSystem = class {
  constructor(ctrl) {
    // 主控制器引用
    this.list = [];
    // 车辆实例列表
    this.active = null;
    // 当前乘坐车辆
    this.meshSkipIds = [];
    // 全部车辆外观 collider id，网格查询时跳过
    this.vehicleLength = 6;
    // 车辆模型归一化后的最大边长度
    this.params = {
      debug: { showPhysicsBox: false, showWheelRays: false, showWheelTravel: false, showWheelSpheres: false },
      // 调试显示
      chassis: { density: 1, linearDamping: 0.05, angularDamping: 0.5 },
      // 车身参数
      model: { rotation: -Math.PI / 2 },
      // 模型旋转
      power: { acceleration: 5, deceleration: 5, maxSpeed: 100 },
      // 动力参数
      steering: { maxSteerAngle: Math.PI / 5, steerTime: 0.45, steerReturnTimeSlow: 0.55, steerReturnTimeFast: 0.4, highSpeedSteerScale: 0.3 },
      // 转向：打满/回正时间（秒），高速收舵
      grip: {
        maxG: 1.2,
        sideFrictionIdle: 1,
        sideFrictionFrontMin: 0.55,
        sideFrictionRearMin: 0.45,
        handbrakeRearFriction: 0.35,
        handbrakeRearDriveScale: 0.65,
        handbrakeReleaseTime: 0.15,
        wheelbaseRatio: 0.55
      },
      // 抓地预算
      suspension: {
        maxTravel: DEFAULT_MAX_SUSPENSION_TRAVEL,
        stiffness: DEFAULT_WHEEL_PHYSICS.suspensionStiffness,
        compression: DEFAULT_WHEEL_PHYSICS.suspensionCompression,
        relaxation: DEFAULT_WHEEL_PHYSICS.suspensionRelaxation,
        maxForce: DEFAULT_WHEEL_PHYSICS.maxSuspensionForce,
        frictionSlip: DEFAULT_WHEEL_PHYSICS.frictionSlip,
        sideFrictionStiffness: DEFAULT_WHEEL_PHYSICS.sideFrictionStiffness,
        rollInfluence: DEFAULT_WHEEL_PHYSICS.rollInfluence
      },
      followVehicleDirection: true
      // 相机跟随方向
    };
    this.boardingPadding = 0.25;
    // 上车/下车余量基准值（按车辆 scale 缩放）
    this.parkingCreepThreshold = 0.05;
    // 驻车状态下清除低速蠕动的水平速度阈值
    this.handbrakeBlend = 0;
    // 1 为手刹全开，松键后插值回 0
    this.scratchLocal = new THREE17.Vector3();
    this.scratchWorld = new THREE17.Vector3();
    this.scratchForward = new THREE17.Vector3();
    this.scratchUp = new THREE17.Vector3();
    this.scratchQuat = new THREE17.Quaternion();
    this.scratchDown = new THREE17.Vector3(0, -1, 0);
    this.wheelSphereDir = new THREE17.Vector3();
    this.carryPrevInv = new THREE17.Matrix4();
    this.carryYaw = new THREE17.Quaternion();
    this.carryUp = new THREE17.Vector3(0, 1, 0);
    this.raycaster = new THREE17.Raycaster();
    this.exitCheckTemps = createCollisionTemps();
    this.obbTemps = createObbObbTemps();
    this.ctrl = ctrl;
    this.raycaster.firstHitOnly = true;
  }
  /** 切换车辆底盘物理盒。 */
  setPhysicsDebugVisible(visible) {
    this.params.debug.showPhysicsBox = visible;
    this.syncDebugVisibility();
  }
  /** 同步全部车辆调试对象的显隐。 */
  syncDebugVisibility() {
    for (const v of this.list) {
      if (v.physicsBoxMesh) {
        if (this.params.debug.showPhysicsBox) {
          if (!v.vehicleGroup.children.includes(v.physicsBoxMesh)) v.vehicleGroup.add(v.physicsBoxMesh);
        } else {
          v.vehicleGroup.remove(v.physicsBoxMesh);
        }
      }
      if (v.wheelRayDebug) v.wheelRayDebug.visible = this.params.debug.showWheelRays;
      if (v.wheelTravelDebug) v.wheelTravelDebug.visible = this.params.debug.showWheelTravel;
      if (v.wheelSphereDebug) {
        v.wheelSphereDebug.visible = this.params.debug.showWheelSpheres;
        if (v.wheelSphereDebug.visible) this.syncWheelSphereDebug(v);
      }
    }
  }
  /** 由车身水平包围圆和人物胶囊半径推算上车范围。 */
  boardingRadius(v) {
    return Math.hypot(v.halfExtents.x, v.halfExtents.z) + this.capsuleRadius() + this.boardingPadding * v.scale;
  }
  /** 返回人物到车辆中心的水平距离，高度超出车辆邻域时返回 Infinity。 */
  boardingDistance(v, position) {
    v.vehicleGroup.updateMatrixWorld(true);
    this.scratchLocal.copy(position);
    v.vehicleGroup.worldToLocal(this.scratchLocal);
    const verticalLimit = v.halfExtents.y + this.capsuleHeight();
    if (Math.abs(this.scratchLocal.y) > verticalLimit) return Infinity;
    return Math.hypot(this.scratchLocal.x, this.scratchLocal.z);
  }
  /** 是否处于车辆中心的上车范围内。 */
  isInBoardingRange(v, position) {
    return this.boardingDistance(v, position) <= this.boardingRadius(v);
  }
  // 加载车辆模型
  async load(opts) {
    try {
      const instance = await loadVehicleModel(opts, {
        loader: this.ctrl.loader,
        scene: this.ctrl.scene,
        vehicleParams: this.params,
        vehicleLength: this.vehicleLength
      });
      this.list.push(instance);
      const kin = this.ctrl.addCollider({
        motion: "kinematic",
        shape: { kind: "mesh", source: instance.vehicleGroup },
        follow: instance.vehicleGroup
      });
      instance.meshColliderId = kin.id;
      const chassis = this.ctrl.addCollider({
        motion: "dynamic",
        shape: { kind: "box", halfExtents: instance.halfExtents.clone() },
        groups: CollisionGroup.VEHICLE,
        mask: CollisionGroup.DEFAULT | CollisionGroup.VEHICLE | CollisionGroup.DEBRIS,
        userData: instance,
        simulate: false
        // 默认会建 DynamicBoxBody；底盘改由 VehicleRigidBody 推进，此处只登记
      });
      instance.chassisColliderId = chassis.id;
      instance.wheelColliderIds = this.registerWheelSpheres(instance);
      this.attachWheelSphereDebug(instance);
      return instance;
    } catch (e) {
      console.error("\u52A0\u8F7D\u8F66\u8F86\u6A21\u578B\u5931\u8D25:", e);
      return void 0;
    }
  }
  // 触发上车流程
  enter() {
    if (!this.list.length || this.ctrl.controllerMode === 1) return;
    let nearest = null;
    let nearestDist = Infinity;
    const pos = this.ctrl.playerCapsule.position;
    for (const v of this.list) {
      const dist = this.boardingDistance(v, pos);
      if (dist <= this.boardingRadius(v) && dist < nearestDist) {
        nearestDist = dist;
        nearest = v;
      }
    }
    if (!nearest) return;
    const vel = nearest.chassisBody.linvel();
    if (Math.hypot(vel.x, vel.z) > 0.1) return;
    this.releaseParkingBrake(nearest);
    this.active = nearest;
    const c = this.ctrl;
    c.controllerMode = 1;
    c.playerVelocity.set(0, 0, 0);
    c.activeDynamicBody = null;
    c.mobileControls?.syncControllerModeBtn(1);
    c.cam.setOverShoulder(false);
    c.animation.playByName("driving");
    c.syncMountedPlayer(nearest);
    c.syncDebugVisibility();
    c.onVehicleEnter?.(nearest);
  }
  // 触发下车流程
  exit() {
    const c = this.ctrl;
    const v = this.active;
    if (!v) return;
    this.applyParkingBrake(v, c.getCurrentDelta() || 1 / 60);
    this.findExitPosition(v, this.scratchWorld);
    this.getDriverForward(v, this.scratchForward);
    c.controllerMode = 0;
    c.mobileControls?.syncControllerModeBtn(0);
    c.cam.setOverShoulder(c.enableOverShoulderView);
    c.leaveVehicleAt(this.scratchWorld, this.scratchForward);
    c.animation.playByName("idle");
    c.syncDebugVisibility();
    this.handbrakeBlend = 0;
    c.onVehicleExit?.(v);
  }
  // 物理步进前更新车辆控制器
  preparePhysics(delta) {
    if (this.ctrl.controllerMode === 1 && this.active) this.applyDriving(delta, this.active);
  }
  // 物理步进后同步车辆视觉
  finishPhysics(delta) {
    for (const v of this.list) {
      const parked = this.ctrl.controllerMode !== 1 || this.active !== v;
      if (parked) this.applyParkingBrake(v, delta);
      v.vehicleController.updateVehicle(delta, this.ctrl.getVehicleGroundMeshes(v));
      this.applyKinematicCarry(v);
    }
    this.resolveVehiclePairs();
    for (const v of this.list) {
      const parked = this.ctrl.controllerMode !== 1 || this.active !== v;
      const vel = v.chassisBody.linvel();
      const speed = Math.hypot(vel.x, vel.z);
      const max = v.maxSpeed / 3.6;
      if (speed > max) {
        const s = max / speed;
        v.chassisBody.setLinvel({ x: vel.x * s, y: vel.y, z: vel.z * s });
      } else if (parked && speed > 0 && speed <= this.parkingCreepThreshold) {
        let hasWheelContact = false;
        for (let i = 0; i < v.vehicleController.numWheels(); i++) {
          if (v.vehicleController.wheelIsInContact(i)) {
            hasWheelContact = true;
            break;
          }
        }
        if (hasWheelContact) v.chassisBody.setLinvel({ x: 0, y: vel.y, z: 0 });
      }
      this.syncVehicleVisual(v, delta);
    }
    if (this.ctrl.controllerMode === 1 && this.active) this.ctrl.syncMountedPlayer(this.active);
  }
  /** 两车底盘盒对盒：跳过自身，驻车中的车仍可被撞开。 */
  resolveVehiclePairs() {
    const n = this.list.length;
    if (n < 2) return;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          resolveObbObb(this.list[i].chassisBody, this.list[j].chassisBody, this.obbTemps);
        }
      }
    }
  }
  // 更新车辆驾驶
  applyDriving(delta, v) {
    const c = this.ctrl;
    const { vehicleController, chassisBody } = v;
    const rotation = chassisBody.rotation();
    this.scratchQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const forward = this.scratchForward.copy(v.forwardLocal).applyQuaternion(this.scratchQuat);
    const throttle = Number(c.input.fwd) - Number(c.input.bkd);
    const sinTheta = Math.max(-1, Math.min(1, forward.y));
    const gEff = 9.81 * v.scale;
    const extraAccel = throttle * sinTheta > 0.05 ? Math.abs(sinTheta) * gEff : 0;
    const wheelCount = Math.max(1, vehicleController.numWheels());
    const mass = chassisBody.mass();
    const linv = chassisBody.linvel();
    const speed01 = Math.min(1, Math.hypot(linv.x, linv.z) / Math.max(0.01, v.maxSpeed / 3.6));
    const { maxSteerAngle, steerTime, steerReturnTimeSlow, steerReturnTimeFast, highSpeedSteerScale = 0.3 } = v.steering;
    const currentSteering = vehicleController.wheelSteering(0) || 0;
    const steerDir = Number(c.input.lft) - Number(c.input.rgt);
    const speedSteer = 1 - (1 - highSpeedSteerScale) * speed01 * speed01;
    const steerLimit = maxSteerAngle * speedSteer;
    const targetSteering = steerLimit * steerDir;
    const responseTime = steerDir === 0 ? steerReturnTimeSlow + (steerReturnTimeFast - steerReturnTimeSlow) * speed01 : steerTime;
    const maxStep = Math.max(steerLimit, 1e-4) / Math.max(1e-4, responseTime) * delta;
    const steeringDelta = targetSteering - currentSteering;
    const steering = currentSteering + Math.sign(steeringDelta) * Math.min(Math.abs(steeringDelta), maxStep);
    vehicleController.setWheelSteering(0, steering);
    vehicleController.setWheelSteering(1, steering);
    const { maxG, sideFrictionIdle, sideFrictionFrontMin, sideFrictionRearMin, handbrakeRearFriction, handbrakeRearDriveScale, handbrakeReleaseTime, wheelbaseRatio } = v.grip;
    const vFwd = linv.x * forward.x + linv.y * forward.y + linv.z * forward.z;
    const wheelbase = Math.max(0.01, v.size.l * wheelbaseRatio);
    const latA = vFwd * vFwd * Math.tan(Math.min(1.5, Math.abs(steering))) / wheelbase;
    const latG = Math.min(maxG, latA / gEff);
    const engineForce = throttle * mass * (v.acceleration + extraAccel) / wheelCount;
    if (c.input.shift) this.handbrakeBlend = 1;
    else if (this.handbrakeBlend > 0) {
      this.handbrakeBlend = Math.max(0, this.handbrakeBlend - delta / Math.max(1e-4, handbrakeReleaseTime));
    }
    const rearDriveScale = 1 - this.handbrakeBlend * (1 - handbrakeRearDriveScale);
    for (let i = 0; i < wheelCount; i++) {
      vehicleController.setWheelEngineForce(i, i >= 2 ? engineForce * rearDriveScale : engineForce);
    }
    const spaceBrake = Number(c.input.space) * mass * v.deceleration / wheelCount * delta;
    for (let i = 0; i < wheelCount; i++) {
      vehicleController.setWheelBrake(i, spaceBrake);
    }
    const gripUsed = latG / maxG;
    const frontFriction = sideFrictionIdle + (sideFrictionFrontMin - sideFrictionIdle) * gripUsed;
    const gripRearFriction = sideFrictionIdle + (sideFrictionRearMin - sideFrictionIdle) * gripUsed;
    const rearFriction = gripRearFriction + (handbrakeRearFriction - gripRearFriction) * this.handbrakeBlend;
    vehicleController.setWheelSideFrictionStiffness(0, frontFriction);
    vehicleController.setWheelSideFrictionStiffness(1, frontFriction);
    vehicleController.setWheelSideFrictionStiffness(2, rearFriction);
    vehicleController.setWheelSideFrictionStiffness(3, rearFriction);
  }
  // 翻车复位
  resetUpright() {
    const v = this.active;
    if (!v || this.ctrl.controllerMode !== 1) return;
    const { chassisBody } = v;
    const t = chassisBody.translation();
    chassisBody.setTranslation({ x: t.x, y: t.y + v.size.h, z: t.z });
    chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 });
    chassisBody.setLinvel({ x: 0, y: 0, z: 0 });
    chassisBody.setAngvel({ x: 0, y: 0, z: 0 });
    this.handbrakeBlend = 0;
  }
  // 计算车身外侧的可用下车位置
  findExitPosition(v, out) {
    v.vehicleGroup.updateMatrixWorld(true);
    this.scratchLocal.copy(v.driverSeatPosition).multiplyScalar(v.scale);
    const seatX = Math.max(-v.halfExtents.x, Math.min(v.halfExtents.x, this.scratchLocal.x));
    const side = this.scratchLocal.z >= 0 ? 1 : -1;
    const clearance = this.capsuleRadius() + this.boardingPadding * v.scale;
    const sideOffset = v.halfExtents.z + clearance;
    const endOffset = v.halfExtents.x + clearance;
    const candidates = [
      { x: seatX, z: side * sideOffset },
      { x: seatX, z: -side * sideOffset },
      { x: endOffset, z: 0 },
      { x: -endOffset, z: 0 }
    ];
    let groundedFallback = null;
    const maxDist = v.size.h + this.capsuleHeight() * 3 + 2;
    this.raycaster.far = maxDist;
    for (const candidate of candidates) {
      this.scratchLocal.set(candidate.x, v.halfExtents.y + this.capsuleHeight() + 0.5, candidate.z);
      v.vehicleGroup.localToWorld(this.scratchLocal);
      out.copy(this.scratchLocal);
      this.raycaster.set(out, this.scratchDown);
      let bestHit;
      for (const mesh of this.ctrl.getColliderMeshes()) {
        const hits = this.raycaster.intersectObject(mesh, false);
        if (hits.length && (!bestHit || hits[0].distance < bestHit.distance)) {
          bestHit = hits[0];
        }
      }
      if (!bestHit) continue;
      out.copy(bestHit.point);
      out.y += this.ctrl.getCapsuleGroundHeight();
      groundedFallback ?? (groundedFallback = out.clone());
      if (this.isCharacterPositionFree(out, v)) return out;
    }
    if (groundedFallback) return out.copy(groundedFallback);
    this.scratchLocal.set(seatX, -v.halfExtents.y + this.ctrl.getCapsuleGroundHeight(), side * sideOffset);
    v.vehicleGroup.localToWorld(this.scratchLocal);
    return out.copy(this.scratchLocal);
  }
  /** 检测下车点处胶囊是否与静态/其他运动学碰撞体重叠。 */
  isCharacterPositionFree(position, v) {
    const cap = this.ctrl.playerCapsule;
    const info = cap.capsuleInfo;
    if (!info || !this.ctrl.getColliderMeshes().length) return true;
    const origParent = cap.parent;
    const origPos = cap.position.clone();
    const origQuat = cap.quaternion.clone();
    const skipMesh = this.ctrl.getKinematicColliderEntries().find((e) => e.source === v.vehicleGroup)?.mesh;
    this.ctrl.scene.attach(cap);
    cap.position.copy(position);
    cap.updateMatrixWorld(true);
    const before = position.clone();
    for (const mesh of this.ctrl.getColliderMeshes()) {
      if (mesh === skipMesh) continue;
      cap.updateMatrixWorld(true);
      applyCapsuleCollision(cap, info, mesh, this.exitCheckTemps);
    }
    const free = cap.position.distanceTo(before) < info.radius * 0.5;
    origParent?.attach(cap);
    cap.position.copy(origPos);
    cap.quaternion.copy(origQuat);
    cap.updateMatrixWorld(true);
    return free;
  }
  /** 有轮子打在运动学网格上时，按平台 prev→current 带走车身。 */
  applyKinematicCarry(v) {
    const votes = /* @__PURE__ */ new Map();
    const n = v.vehicleController.numWheels();
    for (let i = 0; i < n; i++) {
      const mesh = v.vehicleController.wheelContactMesh(i);
      if (!mesh) continue;
      const entry = this.ctrl.getKinematicColliderEntries().find((e) => e.mesh === mesh);
      if (!entry) continue;
      votes.set(entry, (votes.get(entry) ?? 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [entry, count] of votes) {
      if (count > bestCount) {
        best = entry;
        bestCount = count;
      }
    }
    if (!best) return;
    this.carryPrevInv.copy(best.prevWorldMatrix).invert();
    this.scratchWorld.copy(v.chassisBody.position).applyMatrix4(this.carryPrevInv);
    v.chassisBody.position.copy(this.scratchWorld).applyMatrix4(best.source.matrixWorld);
    if (best.deltaRotY !== 0) {
      this.carryYaw.setFromAxisAngle(this.carryUp, best.deltaRotY);
      v.chassisBody.quaternion.premultiply(this.carryYaw);
    }
  }
  // 同步单辆车的模型、车轮和调试盒
  syncVehicleVisual(v, delta = 1 / 60) {
    const t = v.chassisBody.translation();
    const r = v.chassisBody.rotation();
    v.vehicleGroup.position.set(t.x, t.y, t.z);
    v.vehicleGroup.quaternion.set(r.x, r.y, r.z, r.w);
    if (v.wheelRayDebug) v.wheelRayDebug.visible = this.params.debug.showWheelRays;
    if (v.wheelTravelDebug) v.wheelTravelDebug.visible = this.params.debug.showWheelTravel;
    if (v.wheelSphereDebug) {
      v.wheelSphereDebug.visible = this.params.debug.showWheelSpheres;
      if (v.wheelSphereDebug.visible) this.syncWheelSphereDebug(v);
    }
    v.updateWheelVisuals?.(delta);
  }
  /** 取车辆世界前向。 */
  getForward(v, out = new THREE17.Vector3()) {
    v.vehicleGroup.updateMatrixWorld(true);
    return out.copy(v.forwardLocal).transformDirection(v.vehicleGroup.matrixWorld).normalize();
  }
  /** 取驾驶位世界前向。 */
  getDriverForward(v, out = new THREE17.Vector3()) {
    this.scratchQuat.setFromAxisAngle(this.scratchUp.set(0, 1, 0), v.driverSeatRotation);
    this.scratchLocal.set(0, 0, -1).applyQuaternion(this.scratchQuat);
    v.vehicleGroup.updateMatrixWorld(true);
    return out.copy(this.scratchLocal).transformDirection(v.vehicleGroup.matrixWorld).normalize();
  }
  /** 取车辆世界上向。 */
  getUp(v, out = new THREE17.Vector3()) {
    v.vehicleGroup.updateMatrixWorld(true);
    return out.set(0, 1, 0).transformDirection(v.vehicleGroup.matrixWorld).normalize();
  }
  /**
   * 为每只车轮登记只碰 DEBRIS 的运动学球。
   * 球心每帧由底盘位姿 + 悬挂长度推算，不在此写位置。
   */
  registerWheelSpheres(v) {
    const ids = [];
    const n = v.vehicleController.numWheels();
    for (let i = 0; i < n; i++) {
      const wheel = v.vehicleController.wheelAt(i);
      if (!wheel) continue;
      const userData = { vehicle: v, wheelIndex: i };
      const handle = this.ctrl.addCollider({
        motion: "kinematic",
        shape: { kind: "sphere", radius: Math.max(1e-4, wheel.radius) },
        groups: CollisionGroup.VEHICLE,
        mask: CollisionGroup.DEBRIS,
        userData
      });
      ids.push(handle.id);
    }
    return ids;
  }
  /** 创建车轮碰撞球线框，挂在 vehicleGroup 下（底盘局部坐标）。 */
  attachWheelSphereDebug(v) {
    const group = new THREE17.Group();
    group.name = "wheelSphereDebug";
    group.userData.excludeFromCollider = true;
    const geo = new THREE17.SphereGeometry(1, 16, 12);
    const mat = new THREE17.MeshBasicMaterial({
      color: 59552,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    const n = v.vehicleController.numWheels();
    for (let i = 0; i < n; i++) {
      const wheel = v.vehicleController.wheelAt(i);
      if (!wheel) continue;
      const mesh = new THREE17.Mesh(geo, mat);
      mesh.name = `wheelSphereDebug_${i}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = 22;
      mesh.scale.setScalar(Math.max(1e-4, wheel.radius));
      group.add(mesh);
    }
    group.visible = this.params.debug.showWheelSpheres;
    v.vehicleGroup.add(group);
    v.wheelSphereDebug = group;
    this.syncWheelSphereDebug(v);
  }
  /** 按悬挂长度把轮球线框对齐到轮心（底盘局部）。 */
  syncWheelSphereDebug(v) {
    const group = v.wheelSphereDebug;
    if (!group) return;
    let meshIndex = 0;
    const n = v.vehicleController.numWheels();
    for (let i = 0; i < n; i++) {
      const wheel = v.vehicleController.wheelAt(i);
      const mesh = group.children[meshIndex];
      if (!wheel || !mesh) continue;
      meshIndex++;
      this.wheelSphereDir.copy(wheel.direction);
      const dirLen = this.wheelSphereDir.length();
      if (dirLen > 1e-8) this.wheelSphereDir.multiplyScalar(1 / dirLen);
      else this.wheelSphereDir.set(0, -1, 0);
      mesh.position.copy(wheel.connectionPoint).addScaledVector(this.wheelSphereDir, wheel.suspensionLength);
      mesh.scale.setScalar(Math.max(1e-4, wheel.radius));
    }
  }
  /** 移除车轮碰撞球调试线框并释放几何 / 材质。 */
  disposeWheelSphereDebug(v) {
    const group = v.wheelSphereDebug;
    if (!group) return;
    group.removeFromParent();
    const geos = /* @__PURE__ */ new Set();
    const mats = /* @__PURE__ */ new Set();
    for (const child of group.children) {
      const mesh = child;
      if (mesh.geometry) geos.add(mesh.geometry);
      const mat = mesh.material;
      if (Array.isArray(mat)) for (const m of mat) mats.add(m);
      else if (mat) mats.add(mat);
    }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    v.wheelSphereDebug = void 0;
  }
  // 销毁全部车辆
  destroy() {
    for (const v of this.list) {
      if (v.meshColliderId != null) this.ctrl.removeCollider(v.meshColliderId);
      if (v.chassisColliderId != null) this.ctrl.removeCollider(v.chassisColliderId);
      for (const id of v.wheelColliderIds ?? []) this.ctrl.removeCollider(id);
      this.disposeWheelSphereDebug(v);
      this.ctrl.scene.remove(v.vehicleGroup);
      v.destroyVehicleController?.();
    }
    this.list = [];
    this.active = null;
  }
  // 清除活动车辆的驱动力
  stopActive() {
    if (this.active) {
      this.applyParkingBrake(this.active, this.ctrl.getCurrentDelta() || 1 / 60);
    }
  }
  // 对无人车辆施加四轮驻车制动
  applyParkingBrake(v, delta) {
    const wheelCount = Math.max(1, v.vehicleController.numWheels());
    const brake = v.chassisBody.mass() * v.deceleration / wheelCount * delta;
    for (let i = 0; i < wheelCount; i++) {
      v.vehicleController.setWheelEngineForce(i, 0);
      v.vehicleController.setWheelBrake(i, brake);
      v.vehicleController.setWheelSideFrictionStiffness(i, v.sideFrictionStiffness);
    }
  }
  /**
   * 运行时修改底盘盒底相对轮胎触地点的高度。
   * 重定底盘中心的同时反向平移车模和车轮，使车辆外观及轮胎触地点保持原位。
   */
  setClearance(v, clearance) {
    if (!v || !Number.isFinite(clearance) || v.scale <= 0) return;
    const sy = Math.max(1e-3, v.chassisSizeScaleY);
    const minHeight = 1e-3;
    const maxClearance = Math.max(
      0,
      v.chassisTopClearance - minHeight / (v.scale * sy)
    );
    const nextClearance = THREE17.MathUtils.clamp(clearance, 0, maxClearance);
    const previousClearance = v.chassisClearance;
    if (Math.abs(nextClearance - previousClearance) < 1e-8) return;
    const oldHalfY = v.halfExtents.y;
    const newHalfY = Math.max(
      minHeight * 0.5,
      (v.chassisTopClearance - nextClearance) * v.scale * sy * 0.5
    );
    const centerShift = (nextClearance - previousClearance) * v.scale + (newHalfY - oldHalfY);
    const nextHalfExtents = v.halfExtents.clone();
    nextHalfExtents.y = newHalfY;
    v.chassisClearance = nextClearance;
    this.applyChassisShape(v, nextHalfExtents, centerShift);
  }
  /** 运行时修改底盘碰撞盒三轴尺寸比例；Y 轴仍以盒底为缩放锚点。 */
  setChassisSizeScale(v, sizeScale) {
    if (!v || v.scale <= 0) return;
    const oldSx = Math.max(1e-3, v.chassisSizeScaleX);
    const oldSy = Math.max(1e-3, v.chassisSizeScaleY);
    const oldSz = Math.max(1e-3, v.chassisSizeScaleZ);
    const sx = Math.max(1e-3, sizeScale.x ?? oldSx);
    const sy = Math.max(1e-3, sizeScale.y ?? oldSy);
    const sz = Math.max(1e-3, sizeScale.z ?? oldSz);
    if (Math.abs(sx - oldSx) < 1e-8 && Math.abs(sy - oldSy) < 1e-8 && Math.abs(sz - oldSz) < 1e-8) return;
    const nextHalfExtents = new THREE17.Vector3(
      v.halfExtents.x / oldSx * sx,
      Math.max(
        5e-4,
        (v.chassisTopClearance - v.chassisClearance) * v.scale * sy * 0.5
      ),
      v.halfExtents.z / oldSz * sz
    );
    const centerShift = nextHalfExtents.y - v.halfExtents.y;
    v.chassisSizeScaleX = sx;
    v.chassisSizeScaleY = sy;
    v.chassisSizeScaleZ = sz;
    this.applyChassisShape(v, nextHalfExtents, centerShift);
  }
  /** 同步底盘尺寸、车轮硬点、视觉原点和两套碰撞表示。 */
  applyChassisShape(v, nextHalfExtents, centerShift) {
    const shiftsCenter = Math.abs(centerShift) >= 1e-8;
    if (shiftsCenter) {
      for (const child of v.vehicleGroup.children) {
        if (child === v.physicsBoxMesh || child === v.wheelRayDebug || child === v.wheelTravelDebug || child === v.wheelSphereDebug || child === this.ctrl.playerCapsule) continue;
        child.position.y -= centerShift;
      }
      const wheelCount = v.vehicleController.numWheels();
      for (let i = 0; i < wheelCount; i++) {
        const wheel = v.vehicleController.wheelAt(i);
        if (!wheel) continue;
        this.scratchLocal.copy(wheel.connectionPoint);
        this.scratchLocal.y -= centerShift;
        v.vehicleController.setWheelChassisConnectionPointCs(i, this.scratchLocal);
      }
      v.driverSeatPosition.y -= centerShift / v.scale;
      this.scratchUp.set(0, centerShift, 0).applyQuaternion(v.chassisBody.quaternion);
      v.chassisBody.position.add(this.scratchUp);
      v.vehicleGroup.position.copy(v.chassisBody.position);
      v.vehicleGroup.quaternion.copy(v.chassisBody.quaternion);
      v.vehicleGroup.updateMatrixWorld(true);
      this.ctrl.translateKinematicColliderContent(
        v.vehicleGroup,
        this.scratchLocal.set(0, -centerShift, 0)
      );
    }
    v.halfExtents.copy(nextHalfExtents);
    v.chassisBody.setHalfExtents(v.halfExtents);
    const chassisCol = v.chassisColliderId != null ? this.ctrl.collisionWorld.get(v.chassisColliderId) : void 0;
    if (chassisCol?.shape.kind === "box") {
      chassisCol.shape.halfExtents.copy(v.halfExtents);
    }
    if (v.physicsBoxMesh) {
      v.physicsBoxMesh.geometry.dispose();
      v.physicsBoxMesh.geometry = new THREE17.BoxGeometry(
        v.halfExtents.x * 2,
        v.halfExtents.y * 2,
        v.halfExtents.z * 2
      );
      v.physicsBoxMesh.scale.set(1, 1, 1);
    }
    if (v.wheelSphereDebug) this.syncWheelSphereDebug(v);
    if (this.active === v && this.ctrl.controllerMode === 1) {
      this.ctrl.syncMountedPlayer(v);
    }
  }
  // 解除四轮驻车制动
  releaseParkingBrake(v) {
    for (let i = 0; i < v.vehicleController.numWheels(); i++) v.vehicleController.setWheelBrake(i, 0);
  }
  /**
   * 运行时等比缩放车辆。
   * 保持 vehicleGroup.scale = 1，只缩放子节点与物理尺寸，避免座椅/下车点与 halfExtents 双重缩放。
   * 悬挂刚度、阻尼、摩擦滑移不随 scale 变。
   */
  setScale(v, newScale) {
    if (!v || newScale <= 0) return;
    const prev = v.scale > 0 ? v.scale : 1;
    const ratio = newScale / prev;
    if (Math.abs(ratio - 1) < 1e-12) {
      v.scale = newScale;
      return;
    }
    const { chassisBody, vehicleController } = v;
    const n = vehicleController.numWheels();
    let localBottom = Infinity;
    for (let i = 0; i < n; i++) {
      const wheel = vehicleController.wheelAt(i);
      if (!wheel) continue;
      localBottom = Math.min(localBottom, wheel.connectionPoint.y - wheel.radius);
    }
    if (!Number.isFinite(localBottom)) localBottom = -v.halfExtents.y;
    for (const child of v.vehicleGroup.children) {
      if (child === v.wheelRayDebug || child === v.wheelTravelDebug || child === v.wheelSphereDebug) continue;
      child.position.multiplyScalar(ratio);
      child.scale.multiplyScalar(ratio);
    }
    v.halfExtents.multiplyScalar(ratio);
    v.size.l *= ratio;
    v.size.w *= ratio;
    v.size.h *= ratio;
    v.maxSpeed *= ratio;
    v.acceleration *= ratio;
    v.deceleration *= ratio;
    v.scale = newScale;
    chassisBody.setHalfExtents(v.halfExtents);
    chassisBody.setMass(chassisBody.mass() * ratio * ratio * ratio);
    chassisBody.gravityScale = newScale;
    chassisBody.linearVelocity.multiplyScalar(ratio);
    for (let i = 0; i < n; i++) {
      const wheel = vehicleController.wheelAt(i);
      if (!wheel) continue;
      vehicleController.setWheelChassisConnectionPointCs(i, wheel.connectionPoint.multiplyScalar(ratio));
      vehicleController.setWheelRadius(i, wheel.radius * ratio);
      vehicleController.setWheelSuspensionRestLength(i, wheel.restLength * ratio);
      vehicleController.setWheelMaxSuspensionTravel(i, wheel.maxSuspensionTravel * ratio);
      wheel.suspensionLength *= ratio;
      wheel.visualLength *= ratio;
    }
    const chassisCol = v.chassisColliderId != null ? this.ctrl.collisionWorld.get(v.chassisColliderId) : void 0;
    if (chassisCol?.shape.kind === "box") {
      chassisCol.shape.halfExtents.copy(v.halfExtents);
    }
    for (const id of v.wheelColliderIds ?? []) {
      const col = this.ctrl.collisionWorld.get(id);
      if (col?.shape.kind !== "sphere") continue;
      const data = col.userData;
      const wheel = data != null ? v.vehicleController.wheelAt(data.wheelIndex) : void 0;
      if (wheel) col.shape.radius = Math.max(1e-4, wheel.radius);
    }
    if (v.wheelSphereDebug) this.syncWheelSphereDebug(v);
    this.ctrl.scaleKinematicColliderContent(v.vehicleGroup, ratio);
    chassisBody.position.y += localBottom * (1 - ratio);
    v.vehicleGroup.position.copy(chassisBody.position);
    v.vehicleGroup.quaternion.copy(chassisBody.quaternion);
    v.vehicleGroup.updateMatrixWorld(true);
    if (this.active === v && this.ctrl.controllerMode === 1) {
      this.ctrl.syncMountedPlayer(v);
    }
  }
  /** 将列表中全部车辆缩放到同一绝对 scale。 */
  setScaleAll(newScale) {
    for (const v of this.list) this.setScale(v, newScale);
  }
  capsuleRadius() {
    return this.ctrl.playerCapsule?.capsuleInfo?.radius ?? 0;
  }
  capsuleHeight() {
    const info = this.ctrl.playerCapsule?.capsuleInfo;
    if (!info) return 0;
    const sy = this.ctrl.playerCapsule.scale.y || 1;
    return -info.segment.end.y * sy + 2 * info.radius;
  }
};

// src/systems/DynamicBodySystem.ts
import * as THREE21 from "three";
import { ExtendedTriangle } from "three-mesh-bvh";

// src/collision/DynamicSphere.ts
import * as THREE19 from "three";

// src/collision/DynamicBody.ts
import * as THREE18 from "three";
var WAKE_DELTA_V = 1e-4;
var WAKE_DELTA_V_SQ = WAKE_DELTA_V * WAKE_DELTA_V;
var DynamicBody = class {
  /** 写入材质、位姿与视觉引用，并计算 invMass。 */
  constructor(opts) {
    // 重力加速度（通常为负）
    this.position = new THREE18.Vector3();
    // 世界位置
    this.quaternion = new THREE18.Quaternion();
    // 世界朝向
    /** 线速度（保留 velocity 命名以兼容现有调用）。 */
    this.velocity = new THREE18.Vector3();
    this.angularVelocity = new THREE18.Vector3();
    // 角速度
    this.invMass = 0;
    // 质量倒数
    this.invInertia = new THREE18.Vector3();
    this.contactMesh = null;
    // 本帧接触的网格（平台携带用）
    this.colliderId = 0;
    // CollisionWorld 登记 id
    /** 休眠中则跳过积分与窄相。 */
    this.sleeping = false;
    /** 是否允许进入休眠。 */
    this.canSleep = true;
    /** 连续低于休眠阈值的累计时间（秒）。 */
    this.sleepTimer = 0;
    this._r = new THREE18.Vector3();
    this._torque = new THREE18.Vector3();
    this._local = new THREE18.Vector3();
    this._world = new THREE18.Vector3();
    this._invQuat = new THREE18.Quaternion();
    this.density = Math.max(1e-8, opts.density);
    this.mass = Math.max(1e-6, opts.mass);
    this.restitution = Math.max(0, Math.min(1, opts.restitution));
    this.gravity = opts.gravity;
    this.position.copy(opts.position);
    this.velocity.copy(opts.velocity);
    if (opts.angularVelocity) this.angularVelocity.copy(opts.angularVelocity);
    this.linearDamping = opts.linearDamping;
    this.angularDamping = opts.angularDamping;
    this.friction = opts.friction;
    this.mesh = opts.mesh;
    this.debugMesh = opts.debugMesh;
    this.invMass = 1 / this.mass;
  }
  /** 唤醒刚体。 */
  wakeUp() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.sleepTimer = 0;
  }
  /** 进入休眠并清零速度。 */
  putToSleep() {
    if (!this.canSleep) return;
    this.sleeping = true;
    this.sleepTimer = 0;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.contactMesh = null;
  }
  /** 线速度 / 角速度是否低于给定阈值。 */
  isRestingCandidate(linearThreshold, angularThreshold) {
    return this.velocity.lengthSq() <= linearThreshold * linearThreshold && this.angularVelocity.lengthSq() <= angularThreshold * angularThreshold;
  }
  /** 读取世界点处的刚体速度：v + ω × r。 */
  getVelocityAtPoint(point, out) {
    this._r.subVectors(point, this.position);
    return out.copy(this.velocity).add(this._world.copy(this.angularVelocity).cross(this._r));
  }
  /**
   * 休眠唤醒：速度增量 ‖J‖·invMass 超过阈值则醒。
   */
  wakeIfImpulseMeaningful(impulse) {
    if (!this.sleeping) return;
    const inv = this.invMass;
    if (impulse.lengthSq() * inv * inv > WAKE_DELTA_V_SQ) this.wakeUp();
  }
  /** 在质心施加冲量。 */
  applyImpulse(impulse) {
    this.wakeIfImpulseMeaningful(impulse);
    this.velocity.addScaledVector(impulse, this.invMass);
  }
  /** 在世界点施加冲量，同时产生角速度。 */
  applyImpulseAtPoint(impulse, contactPoint) {
    this.wakeIfImpulseMeaningful(impulse);
    this.velocity.addScaledVector(impulse, this.invMass);
    this._r.subVectors(contactPoint, this.position);
    this.angularVelocity.add(this.angularDeltaFromImpulse(impulse, this._r));
  }
  /** 将冲量转为世界角速度增量：ω += R I⁻¹ Rᵀ (r × J)。 */
  angularDeltaFromImpulse(impulse, r) {
    this._torque.copy(r).cross(impulse);
    this._invQuat.copy(this.quaternion).invert();
    this._local.copy(this._torque).applyQuaternion(this._invQuat);
    this._local.x *= this.invInertia.x;
    this._local.y *= this.invInertia.y;
    this._local.z *= this.invInertia.z;
    return this._world.copy(this._local).applyQuaternion(this.quaternion);
  }
  /** 指数线 / 角阻尼。 */
  applyDamping(dt) {
    const lin = Math.exp(-this.linearDamping * dt);
    const ang = Math.exp(-this.angularDamping * dt);
    this.velocity.multiplyScalar(lin);
    this.angularVelocity.multiplyScalar(ang);
  }
  /** 用当前速度积分位置和朝向。 */
  integrate(dt) {
    this.position.addScaledVector(this.velocity, dt);
    integrateQuaternion(this.quaternion, this.angularVelocity, dt);
  }
};

// src/collision/DynamicSphere.ts
var DynamicSphereBody = class extends DynamicBody {
  // 碰撞半径
  /** 按体积 × 密度算质量，并写入球惯量。 */
  constructor(opts) {
    const volume = 4 / 3 * Math.PI * opts.radius * opts.radius * opts.radius;
    super({
      density: opts.density,
      mass: volume * Math.max(1e-8, opts.density),
      restitution: opts.restitution,
      gravity: opts.gravity,
      position: opts.position,
      velocity: opts.velocity,
      angularVelocity: opts.angularVelocity,
      linearDamping: opts.linearDamping,
      angularDamping: opts.angularDamping,
      friction: opts.friction,
      mesh: opts.mesh,
      debugMesh: opts.debugMesh
    });
    this.kind = "sphere";
    this.radius = opts.radius;
    this.setSphereInertia();
  }
  /** 特征半尺寸即半径。 */
  characteristicExtent() {
    return this.radius;
  }
  /** 实心球惯量 I = ⅖ m r²（对角），并写 invInertia。 */
  setSphereInertia() {
    const i = Math.max(1e-12, 0.4 * this.mass * this.radius * this.radius);
    const inv = 1 / i;
    this.invInertia.set(inv, inv, inv);
  }
};
function isSphereBody(body) {
  return body.kind === "sphere";
}
function createSphereCollisionTemps() {
  return {
    invMat: new THREE19.Matrix4(),
    normalMat: new THREE19.Matrix3(),
    invQuat: new THREE19.Quaternion(),
    localSphere: new THREE19.Sphere(),
    closest: new THREE19.Vector3(),
    worldClosest: new THREE19.Vector3(),
    offset: new THREE19.Vector3(),
    before: new THREE19.Vector3(),
    normal: new THREE19.Vector3(),
    local: new THREE19.Vector3(),
    contact: new THREE19.Vector3(),
    boxVel: new THREE19.Vector3(),
    impulse: new THREE19.Vector3()
  };
}
function collectSphereVsMeshContacts(position, radius, mesh, temps, raw, rawCount, maxRaw) {
  const tree = mesh.geometry?.boundsTree;
  if (!tree || rawCount >= maxRaw) return rawCount;
  temps.invMat.copy(mesh.matrixWorld).invert();
  temps.localSphere.center.copy(position).applyMatrix4(temps.invMat);
  const scale = mesh.scale.x || 1;
  temps.localSphere.radius = radius / scale;
  temps.normalMat.getNormalMatrix(mesh.matrixWorld);
  tree.shapecast({
    intersectsBounds: (box) => box.intersectsSphere(temps.localSphere),
    intersectsTriangle: (tri) => {
      if (rawCount >= maxRaw) return true;
      tri.closestPointToPoint(temps.localSphere.center, temps.closest);
      temps.offset.subVectors(temps.localSphere.center, temps.closest);
      const dist = temps.offset.length();
      const penetration = temps.localSphere.radius - dist;
      const localSkin = contactSkinForExtent(radius) / Math.max(scale, 1e-8);
      if (penetration < -localSkin) return;
      if (dist > 1e-8) temps.normal.copy(temps.offset).multiplyScalar(1 / dist);
      else temps.normal.set(0, 1, 0);
      temps.normal.applyMatrix3(temps.normalMat).normalize();
      temps.worldClosest.copy(temps.closest).applyMatrix4(mesh.matrixWorld);
      const slot = raw[rawCount++];
      slot.point.copy(temps.worldClosest);
      slot.normal.copy(temps.normal);
      slot.penetration = penetration * scale;
    },
    boundsTraverseOrder: (box) => box.distanceToPoint(temps.localSphere.center) - temps.localSphere.radius
  });
  return rawCount;
}
function collideSphereVsObb(position, radius, boxPos, boxQuat, half, temps) {
  temps.invQuat.copy(boxQuat).invert();
  temps.local.copy(position).sub(boxPos).applyQuaternion(temps.invQuat);
  const hx = half.x;
  const hy = half.y;
  const hz = half.z;
  const inside = Math.abs(temps.local.x) <= hx && Math.abs(temps.local.y) <= hy && Math.abs(temps.local.z) <= hz;
  if (inside) {
    const dx = hx - Math.abs(temps.local.x);
    const dy = hy - Math.abs(temps.local.y);
    const dz = hz - Math.abs(temps.local.z);
    if (dx <= dy && dx <= dz) {
      temps.local.x = Math.sign(temps.local.x || 1) * (hx + radius);
      temps.normal.set(Math.sign(temps.local.x), 0, 0);
    } else if (dy <= dz) {
      temps.local.y = Math.sign(temps.local.y || 1) * (hy + radius);
      temps.normal.set(0, Math.sign(temps.local.y), 0);
    } else {
      temps.local.z = Math.sign(temps.local.z || 1) * (hz + radius);
      temps.normal.set(0, 0, Math.sign(temps.local.z));
    }
    temps.normal.applyQuaternion(boxQuat);
    position.copy(temps.local).applyQuaternion(boxQuat).add(boxPos);
    temps.contact.copy(position).addScaledVector(temps.normal, -radius);
    return true;
  }
  temps.closest.set(
    Math.min(hx, Math.max(-hx, temps.local.x)),
    Math.min(hy, Math.max(-hy, temps.local.y)),
    Math.min(hz, Math.max(-hz, temps.local.z))
  );
  temps.offset.subVectors(temps.local, temps.closest);
  const dist = temps.offset.length();
  if (dist >= radius || dist < 1e-8) return false;
  temps.offset.multiplyScalar(1 / dist);
  temps.local.addScaledVector(temps.offset, radius - dist);
  temps.normal.copy(temps.offset).applyQuaternion(boxQuat);
  position.copy(temps.local).applyQuaternion(boxQuat).add(boxPos);
  temps.contact.copy(temps.closest).applyQuaternion(boxQuat).add(boxPos);
  return true;
}
function resolveSphereSphere(a, b, temps, restitution) {
  temps.offset.subVectors(a.position, b.position);
  const dist = temps.offset.length();
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return;
  if (dist > 1e-8) temps.normal.copy(temps.offset).multiplyScalar(1 / dist);
  else temps.normal.set(0, 1, 0);
  const depth = minDist - dist;
  const invA = a.invMass;
  const invB = b.invMass;
  const invSum = invA + invB;
  a.position.addScaledVector(temps.normal, depth * (invA / invSum));
  b.position.addScaledVector(temps.normal, -depth * (invB / invSum));
  const rel = a.velocity.dot(temps.normal) - b.velocity.dot(temps.normal);
  if (rel >= 0) return;
  const impulse = -(1 + restitution) * rel / invSum;
  a.velocity.addScaledVector(temps.normal, impulse * invA);
  b.velocity.addScaledVector(temps.normal, -impulse * invB);
}

// src/collision/DynamicBox.ts
import * as THREE20 from "three";
var DynamicBoxBody = class extends DynamicBody {
  // 碰撞盒半边长
  /** 按体积 × 密度算质量，并写入长方体惯量。 */
  constructor(opts) {
    const hx = Math.max(1e-4, opts.halfExtents.x);
    const hy = Math.max(1e-4, opts.halfExtents.y);
    const hz = Math.max(1e-4, opts.halfExtents.z);
    const volume = 8 * hx * hy * hz;
    super({
      density: opts.density,
      mass: volume * Math.max(1e-8, opts.density),
      restitution: opts.restitution,
      gravity: opts.gravity,
      position: opts.position,
      velocity: opts.velocity,
      angularVelocity: opts.angularVelocity,
      linearDamping: opts.linearDamping,
      angularDamping: opts.angularDamping,
      friction: opts.friction,
      mesh: opts.mesh,
      debugMesh: opts.debugMesh
    });
    this.kind = "box";
    // 形状判别
    this.halfExtents = new THREE20.Vector3();
    this.halfExtents.set(hx, hy, hz);
    if (opts.quaternion) this.quaternion.copy(opts.quaternion);
    this.setCuboidInertia();
  }
  /** 特征半尺寸取三边最大值。 */
  characteristicExtent() {
    return Math.max(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z);
  }
  /** 实心长方体惯量 I = m/12 (h²+d²) 等，并写 invInertia。 */
  setCuboidInertia() {
    const m = this.mass;
    const w = this.halfExtents.x * 2;
    const h = this.halfExtents.y * 2;
    const d = this.halfExtents.z * 2;
    const ix = Math.max(1e-12, m / 12 * (h * h + d * d));
    const iy = Math.max(1e-12, m / 12 * (w * w + d * d));
    const iz = Math.max(1e-12, m / 12 * (w * w + h * h));
    this.invInertia.set(1 / ix, 1 / iy, 1 / iz);
  }
};
function isBoxBody(body) {
  return body.kind === "box";
}
var CAPSULE_OBB_SAMPLES = 8;
var _invQuat4 = new THREE20.Quaternion();
var _local3 = new THREE20.Vector3();
var _sample = new THREE20.Vector3();
var _bestOnSeg = new THREE20.Vector3();
var _bestDirLocal = new THREE20.Vector3();
var _candDir = new THREE20.Vector3();
function capsuleObbOverlap(capsule, capsuleInfo, boxPos, boxQuat, half, temps) {
  const segment = capsuleInfo.dynamicsSegment ?? capsuleInfo.segment;
  temps.localSeg.start.copy(segment.start).applyMatrix4(capsule.matrixWorld);
  temps.localSeg.end.copy(segment.end).applyMatrix4(capsule.matrixWorld);
  _invQuat4.copy(boxQuat).invert();
  const hx = half.x;
  const hy = half.y;
  const hz = half.z;
  let bestDist = Infinity;
  let insideAxis = -1;
  let insideSign = 1;
  let insideDepth = 0;
  for (let i = 0; i <= CAPSULE_OBB_SAMPLES; i++) {
    const t = i / CAPSULE_OBB_SAMPLES;
    _sample.lerpVectors(temps.localSeg.start, temps.localSeg.end, t);
    _local3.copy(_sample).sub(boxPos).applyQuaternion(_invQuat4);
    const inside = Math.abs(_local3.x) <= hx && Math.abs(_local3.y) <= hy && Math.abs(_local3.z) <= hz;
    if (inside) {
      const dx = hx - Math.abs(_local3.x);
      const dy = hy - Math.abs(_local3.y);
      const dz = hz - Math.abs(_local3.z);
      const depth = capsuleInfo.radius + Math.min(dx, dy, dz);
      if (depth > insideDepth) {
        insideDepth = depth;
        _bestOnSeg.copy(_sample);
        if (dx <= dy && dx <= dz) {
          insideAxis = 0;
          insideSign = Math.sign(_local3.x || 1);
        } else if (dy <= dz) {
          insideAxis = 1;
          insideSign = Math.sign(_local3.y || 1);
        } else {
          insideAxis = 2;
          insideSign = Math.sign(_local3.z || 1);
        }
      }
      continue;
    }
    const cx = Math.min(hx, Math.max(-hx, _local3.x));
    const cy = Math.min(hy, Math.max(-hy, _local3.y));
    const cz = Math.min(hz, Math.max(-hz, _local3.z));
    _candDir.set(_local3.x - cx, _local3.y - cy, _local3.z - cz);
    const dist = _candDir.length();
    if (dist >= bestDist) continue;
    bestDist = dist;
    _bestOnSeg.copy(_sample);
    if (dist > 1e-8) _bestDirLocal.copy(_candDir).multiplyScalar(1 / dist);
    else _bestDirLocal.set(0, 1, 0);
  }
  if (insideDepth > 0) {
    temps.closestSeg.copy(_bestOnSeg);
    if (insideAxis === 0) temps.closestTri.set(insideSign, 0, 0);
    else if (insideAxis === 1) temps.closestTri.set(0, insideSign, 0);
    else temps.closestTri.set(0, 0, insideSign);
    temps.closestTri.applyQuaternion(boxQuat).negate();
    return insideDepth;
  }
  if (bestDist >= capsuleInfo.radius) return 0;
  temps.closestSeg.copy(_bestOnSeg);
  temps.closestTri.copy(_bestDirLocal).applyQuaternion(boxQuat).negate();
  return capsuleInfo.radius - bestDist;
}

// src/collision/colliderDesc.ts
var DYNAMIC_BODY_DEFAULTS = {
  density: 1,
  restitution: 0.2,
  friction: 0.6,
  linearDamping: 0.4,
  angularDamping: 0.6
};

// src/systems/DynamicBodySystem.ts
var TARGET_SUB_DT = 1 / 1200;
var MAX_SUBSTEPS = 20;
var MAX_PUSH_RATIO = 2;
var MAX_SPEED_GRAVITY = 2;
var CHARACTER_PUSH_MASS = 10;
var MAX_RAW2 = 64;
var POS_CORRECT = 0.4;
var MAX_DEPENETRATION_EXTENTS = 20;
var ROLL_BLEND = 0.45;
var SUPPORT_Y2 = 0.5;
var DYNAMIC_MASK = CollisionGroup.DEFAULT | CollisionGroup.VEHICLE | CollisionGroup.DEBRIS;
var KIN_CAPSULE_BAUMGARTE = 0.8;
var CHAR_SEP_MAX_RADIUS = 1.25;
var SLEEP_LINEAR = 0.3;
var SLEEP_ANGULAR = 0.7;
var SLEEP_TIME = 0.35;
var SLEEP_WAKE_FACTOR = 3;
var BROADPHASE_CELL_SCALE = 2;
var BOX_TRIANGLES = [
  0,
  2,
  3,
  0,
  3,
  1,
  4,
  5,
  7,
  4,
  7,
  6,
  0,
  4,
  6,
  0,
  6,
  2,
  1,
  3,
  7,
  1,
  7,
  5,
  0,
  1,
  5,
  0,
  5,
  4,
  2,
  6,
  7,
  2,
  7,
  3
];
var DynamicBodySystem = class {
  constructor(ctrl) {
    this.list = [];
    // 全部动态刚体
    /** 动态刚体碰撞线框开关。 */
    this.debugVisible = false;
    this.temps = createSphereCollisionTemps();
    this.carryPrevInv = new THREE21.Matrix4();
    this.skipVehicleMeshes = [];
    // 跳过车辆外观，避免与底盘盒重复
    this.capsuleTemps = createCollisionTemps();
    this.contactSolver = new ContactImpulseSolver();
    this.contactCaches = /* @__PURE__ */ new Map();
    this.raw = Array.from({ length: MAX_RAW2 }, () => ({
      point: new THREE21.Vector3(),
      normal: new THREE21.Vector3(),
      penetration: 0
    }));
    this.manifolds = [];
    this.bodyVel = new THREE21.Vector3();
    this.rollTarget = new THREE21.Vector3();
    this.boxMeshCollision = new VehicleCollision();
    this.obbTemps = createObbObbTemps();
    this.contactPoint = new THREE21.Vector3();
    this.wheelCenter = new THREE21.Vector3();
    this.wheelDir = new THREE21.Vector3();
    this.wheelPosBefore = new THREE21.Vector3();
    /** 动态体互撞宽相位（XZ 网格，每子步重建）。 */
    this.broadphaseGrid = /* @__PURE__ */ new Map();
    this.broadphaseCellSize = 1;
    this.bodyAabbMin = [];
    this.bodyAabbMax = [];
    this.broadphaseAxisX = new THREE21.Vector3();
    this.broadphaseAxisY = new THREE21.Vector3();
    this.broadphaseAxisZ = new THREE21.Vector3();
    this.broadphasePairSeen = /* @__PURE__ */ new Set();
    this.groundRay = new THREE21.Ray();
    this.groundBox = new THREE21.Box3();
    this.groundSphere = new THREE21.Sphere();
    this.groundOriginLocal = new THREE21.Vector3();
    this.groundDirectionLocal = new THREE21.Vector3();
    this.groundPointLocal = new THREE21.Vector3();
    this.groundNormalLocal = new THREE21.Vector3();
    this.groundInvQuat = new THREE21.Quaternion();
    this.groundPoint = new THREE21.Vector3();
    this.groundNormal = new THREE21.Vector3();
    this.groundVolumeQuery = createGroundProbeQuery();
    this.groundProbeSegment = new THREE21.Line3();
    this.groundProbeTriangle = new ExtendedTriangle();
    this.groundProbeTrianglePoint = new THREE21.Vector3();
    this.groundProbeSegmentPoint = new THREE21.Vector3();
    this.groundProbeSphereDelta = new THREE21.Vector3();
    this.groundProbeSphereHorizontal = new THREE21.Vector3();
    this.groundProbeBoxVertices = Array.from({ length: 8 }, () => new THREE21.Vector3());
    this.groundHit = {
      body: null,
      point: new THREE21.Vector3(),
      normal: new THREE21.Vector3(),
      velocity: new THREE21.Vector3()
    };
    this.ctrl = ctrl;
    this.contactSolver.velocityIterations = 12;
  }
  /** 返回动态刚体调试开关。 */
  getDebugVisible() {
    return this.debugVisible;
  }
  /** 切换动态刚体碰撞线框。 */
  setDebugVisible(visible) {
    this.debugVisible = visible;
    this.syncDebugVisibility();
  }
  /** 同步全部动态刚体碰撞线框。 */
  syncDebugVisibility() {
    for (const body of this.list) {
      this.syncDebugMesh(body);
      if (this.debugVisible) {
        if (!this.ctrl.scene.children.includes(body.debugMesh)) this.ctrl.scene.add(body.debugMesh);
      } else {
        this.ctrl.scene.remove(body.debugMesh);
      }
    }
  }
  /** 当前人物推动假质量：CHARACTER_PUSH_MASS × scale。 */
  characterPushMass() {
    const s = this.ctrl.playerModelConfig.scale;
    return CHARACTER_PUSH_MASS * s;
  }
  /** 添加动态球。 */
  addSphere(desc) {
    if (desc.shape.kind !== "sphere") {
      throw new Error('[DynamicBodySystem] addSphere \u9700\u8981 shape.kind === "sphere"');
    }
    const mesh = desc.mesh;
    if (!mesh) {
      throw new Error("[DynamicBodySystem] addSphere \u9700\u8981 mesh");
    }
    const radius = Math.max(1e-4, desc.shape.radius);
    const position = (desc.shape.position ?? new THREE21.Vector3()).clone();
    const velocity = (desc.velocity ?? new THREE21.Vector3()).clone();
    const density = desc.density ?? DYNAMIC_BODY_DEFAULTS.density;
    const restitution = desc.restitution ?? DYNAMIC_BODY_DEFAULTS.restitution;
    const friction = desc.friction ?? DYNAMIC_BODY_DEFAULTS.friction;
    const linearDamping = desc.linearDamping ?? DYNAMIC_BODY_DEFAULTS.linearDamping;
    const angularDamping = desc.angularDamping ?? DYNAMIC_BODY_DEFAULTS.angularDamping;
    const gravity = desc.gravity ?? this.ctrl.gravity;
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    const debugMesh = new THREE21.Mesh(
      new THREE21.SphereGeometry(1, 16, 12),
      new THREE21.MeshBasicMaterial({ color: 16777215, wireframe: true, transparent: true, opacity: 0.35 })
    );
    debugMesh.scale.setScalar(radius);
    debugMesh.position.copy(position);
    const body = new DynamicSphereBody({
      radius,
      density,
      restitution,
      gravity,
      position,
      velocity,
      angularVelocity: desc.angularVelocity,
      linearDamping,
      angularDamping,
      friction,
      mesh,
      debugMesh
    });
    const col = this.ctrl.collisionWorld.add({
      motion: "dynamic",
      shape: { kind: "sphere", radius },
      mask: DYNAMIC_MASK,
      userData: body
    });
    body.colliderId = col.id;
    this.list.push(body);
    this.contactCaches.set(body, new ContactCache());
    if (this.debugVisible) this.ctrl.scene.add(debugMesh);
    return body;
  }
  /** 添加动态盒。 */
  addBox(desc) {
    if (desc.shape.kind !== "box") {
      throw new Error('[DynamicBodySystem] addBox \u9700\u8981 shape.kind === "box"');
    }
    const mesh = desc.mesh;
    if (!mesh) {
      throw new Error("[DynamicBodySystem] addBox \u9700\u8981 mesh");
    }
    const half = desc.shape.halfExtents.clone();
    half.x = Math.max(1e-4, half.x);
    half.y = Math.max(1e-4, half.y);
    half.z = Math.max(1e-4, half.z);
    const position = (desc.shape.position ?? new THREE21.Vector3()).clone();
    const velocity = (desc.velocity ?? new THREE21.Vector3()).clone();
    const density = desc.density ?? DYNAMIC_BODY_DEFAULTS.density;
    const restitution = desc.restitution ?? DYNAMIC_BODY_DEFAULTS.restitution;
    const friction = desc.friction ?? DYNAMIC_BODY_DEFAULTS.friction;
    const linearDamping = desc.linearDamping ?? DYNAMIC_BODY_DEFAULTS.linearDamping;
    const angularDamping = desc.angularDamping ?? DYNAMIC_BODY_DEFAULTS.angularDamping;
    const gravity = desc.gravity ?? this.ctrl.gravity;
    mesh.scale.set(half.x * 2, half.y * 2, half.z * 2);
    mesh.position.copy(position);
    if (desc.shape.quaternion) mesh.quaternion.copy(desc.shape.quaternion);
    const debugMesh = new THREE21.Mesh(
      new THREE21.BoxGeometry(1, 1, 1),
      new THREE21.MeshBasicMaterial({ color: 16777215, wireframe: true, transparent: true, opacity: 0.35 })
    );
    debugMesh.scale.copy(mesh.scale);
    debugMesh.position.copy(position);
    if (desc.shape.quaternion) debugMesh.quaternion.copy(desc.shape.quaternion);
    const body = new DynamicBoxBody({
      halfExtents: half,
      density,
      restitution,
      gravity,
      position,
      quaternion: desc.shape.quaternion,
      velocity,
      angularVelocity: desc.angularVelocity,
      linearDamping,
      angularDamping,
      friction,
      mesh,
      debugMesh
    });
    const col = this.ctrl.collisionWorld.add({
      motion: "dynamic",
      shape: { kind: "box", halfExtents: half.clone() },
      mask: DYNAMIC_MASK,
      userData: body
    });
    body.colliderId = col.id;
    this.list.push(body);
    this.contactCaches.set(body, new ContactCache());
    if (this.debugVisible) this.ctrl.scene.add(debugMesh);
    return body;
  }
  /** 移除动态刚体。 */
  remove(body) {
    const idx = this.list.indexOf(body);
    if (idx === -1) return;
    this.list.splice(idx, 1);
    this.contactCaches.delete(body);
    if (this.ctrl.activeDynamicBody === body) this.ctrl.activeDynamicBody = null;
    this.ctrl.collisionWorld.remove(body.colliderId);
    this.ctrl.scene.remove(body.debugMesh);
    body.debugMesh.geometry.dispose();
    body.debugMesh.material.dispose();
  }
  /** 按 CollisionWorld id 查找动态刚体。 */
  findByColliderId(id) {
    return this.list.find((b) => b.colliderId === id);
  }
  /** 清除全部动态刚体。 */
  clear() {
    while (this.list.length) this.remove(this.list[this.list.length - 1]);
  }
  /** 从指定世界坐标向下查询最高的动态表面。 */
  raycastGround(origin, minNormalY = SUPPORT_Y2, excludeKinds) {
    let bestY = -Infinity;
    let bestBody = null;
    for (const body of this.list) {
      if (excludeKinds?.includes(body.kind)) continue;
      let hit = false;
      if (isBoxBody(body)) hit = this.raycastBoxGround(origin, body, minNormalY);
      else if (isSphereBody(body)) hit = this.raycastSphereGround(origin, body, minNormalY);
      if (!hit || this.groundPoint.y <= bestY) continue;
      bestY = this.groundPoint.y;
      bestBody = body;
      this.groundHit.point.copy(this.groundPoint);
      this.groundHit.normal.copy(this.groundNormal);
    }
    if (!bestBody) return null;
    this.groundHit.body = bestBody;
    bestBody.getVelocityAtPoint(this.groundHit.point, this.groundHit.velocity);
    return this.groundHit;
  }
  /** 用带半径的竖直传感区查询最近的动态支撑面。 */
  probeGroundVolume(sensorStart, down, maxDistance, sensorRadius, minNormalY = SUPPORT_Y2) {
    if (maxDistance <= 0 || sensorRadius <= 0 || down.lengthSq() === 0) return null;
    resetGroundProbeQuery(
      this.groundVolumeQuery,
      sensorStart,
      down,
      maxDistance,
      sensorRadius,
      minNormalY
    );
    this.groundProbeSegment.start.copy(this.groundVolumeQuery.start);
    this.groundProbeSegment.end.copy(this.groundVolumeQuery.start).addScaledVector(this.groundVolumeQuery.down, this.groundVolumeQuery.maxDistance);
    let bestBody = null;
    for (const body of this.list) {
      const improved = isBoxBody(body) ? this.probeBoxGroundVolume(body) : isSphereBody(body) ? this.probeSphereGroundVolume(body) : false;
      if (improved) bestBody = body;
    }
    if (!bestBody) return null;
    this.groundHit.point.copy(this.groundVolumeQuery.hit.point);
    this.groundHit.normal.copy(this.groundVolumeQuery.hit.normal);
    this.groundHit.body = bestBody;
    bestBody.getVelocityAtPoint(this.groundHit.point, this.groundHit.velocity);
    return this.groundHit;
  }
  /** 圆柱传感区与动态 OBB 的表面三角形查询。 */
  probeBoxGroundVolume(body) {
    const half = body.halfExtents;
    for (let i = 0; i < this.groundProbeBoxVertices.length; i++) {
      this.groundProbeBoxVertices[i].set(
        (i & 1) === 0 ? -half.x : half.x,
        (i & 2) === 0 ? -half.y : half.y,
        (i & 4) === 0 ? -half.z : half.z
      ).applyQuaternion(body.quaternion).add(body.position);
    }
    let improved = false;
    for (let i = 0; i < BOX_TRIANGLES.length; i += 3) {
      this.groundProbeTriangle.set(
        this.groundProbeBoxVertices[BOX_TRIANGLES[i]],
        this.groundProbeBoxVertices[BOX_TRIANGLES[i + 1]],
        this.groundProbeBoxVertices[BOX_TRIANGLES[i + 2]]
      );
      if (tryGroundProbeTriangle(
        this.groundVolumeQuery,
        this.groundProbeSegment,
        this.groundProbeTriangle,
        this.groundProbeTrianglePoint,
        this.groundProbeSegmentPoint,
        this.groundNormal
      )) improved = true;
    }
    return improved;
  }
  /** 圆柱传感区与动态球的解析查询。 */
  probeSphereGroundVolume(body) {
    const query = this.groundVolumeQuery;
    this.groundProbeSphereDelta.subVectors(body.position, query.start);
    const centerDistance = this.groundProbeSphereDelta.dot(query.down);
    this.groundProbeSphereHorizontal.copy(this.groundProbeSphereDelta).addScaledVector(query.down, -centerDistance);
    const horizontalDistance = this.groundProbeSphereHorizontal.length();
    const surfaceOffset = Math.max(0, horizontalDistance - query.radius);
    if (surfaceOffset > body.radius) return false;
    const upwardExtent = Math.sqrt(Math.max(0, body.radius * body.radius - surfaceOffset * surfaceOffset));
    this.groundPoint.copy(body.position);
    if (horizontalDistance > 1e-8) {
      this.groundPoint.addScaledVector(
        this.groundProbeSphereHorizontal,
        -surfaceOffset / horizontalDistance
      );
    }
    this.groundPoint.addScaledVector(query.down, -upwardExtent);
    this.groundNormal.subVectors(this.groundPoint, body.position).normalize();
    return tryGroundProbeCandidate(query, this.groundPoint, this.groundNormal);
  }
  /** 向下射线与动态 OBB 求交。 */
  raycastBoxGround(origin, body, minNormalY) {
    this.groundInvQuat.copy(body.quaternion).invert();
    this.groundOriginLocal.copy(origin).sub(body.position).applyQuaternion(this.groundInvQuat);
    this.groundDirectionLocal.set(0, -1, 0).applyQuaternion(this.groundInvQuat).normalize();
    this.groundRay.set(this.groundOriginLocal, this.groundDirectionLocal);
    this.groundBox.min.copy(body.halfExtents).multiplyScalar(-1);
    this.groundBox.max.copy(body.halfExtents);
    if (!this.groundRay.intersectBox(this.groundBox, this.groundPointLocal)) return false;
    const dx = Math.abs(Math.abs(this.groundPointLocal.x) - body.halfExtents.x);
    const dy = Math.abs(Math.abs(this.groundPointLocal.y) - body.halfExtents.y);
    const dz = Math.abs(Math.abs(this.groundPointLocal.z) - body.halfExtents.z);
    if (dx <= dy && dx <= dz) {
      this.groundNormalLocal.set(Math.sign(this.groundPointLocal.x || 1), 0, 0);
    } else if (dy <= dz) {
      this.groundNormalLocal.set(0, Math.sign(this.groundPointLocal.y || 1), 0);
    } else {
      this.groundNormalLocal.set(0, 0, Math.sign(this.groundPointLocal.z || 1));
    }
    this.groundNormal.copy(this.groundNormalLocal).applyQuaternion(body.quaternion).normalize();
    if (this.groundNormal.y < minNormalY) return false;
    this.groundPoint.copy(this.groundPointLocal).applyQuaternion(body.quaternion).add(body.position);
    return this.groundPoint.y <= origin.y;
  }
  /** 向下射线与动态球求交。 */
  raycastSphereGround(origin, body, minNormalY) {
    this.groundRay.set(origin, this.groundDirectionLocal.set(0, -1, 0));
    this.groundSphere.center.copy(body.position);
    this.groundSphere.radius = body.radius;
    if (!this.groundRay.intersectSphere(this.groundSphere, this.groundPoint)) return false;
    this.groundNormal.subVectors(this.groundPoint, body.position).normalize();
    return this.groundNormal.y >= minNormalY && this.groundPoint.y <= origin.y;
  }
  /** 推进全部动态刚体：子步求解 → 平台带走 → 休眠判定 → 同步视觉。 */
  step(delta) {
    if (!this.list.length) return;
    this.skipVehicleMeshes.length = 0;
    for (const v of this.ctrl.vehicle.list) {
      if (v.meshColliderId != null) this.skipVehicleMeshes.push(v.meshColliderId);
    }
    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(delta / TARGET_SUB_DT)));
    const sub = delta / substeps;
    for (let i = 0; i < substeps; i++) this.stepSub(sub);
    for (const body of this.list) this.applyKinematicCarry(body);
    for (const body of this.list) this.updateSleep(body, delta);
    for (const body of this.list) {
      body.mesh.position.copy(body.position);
      body.mesh.quaternion.copy(body.quaternion);
      if (this.debugVisible) this.syncDebugMesh(body);
    }
  }
  /** 将动态刚体当前形状与位姿写入调试 mesh。 */
  syncDebugMesh(body) {
    body.debugMesh.position.copy(body.position);
    body.debugMesh.quaternion.copy(body.quaternion);
    if (isSphereBody(body)) body.debugMesh.scale.setScalar(body.radius);
    else if (isBoxBody(body)) {
      body.debugMesh.scale.set(
        body.halfExtents.x * 2,
        body.halfExtents.y * 2,
        body.halfExtents.z * 2
      );
    }
  }
  /** 单次子步：重力积分 → 按形状窄相 → 阻尼与限速。 */
  stepSub(dt) {
    for (const body of this.list) {
      if (body.sleeping) {
        this.collideSleepingBodyWithVehicles(body);
        continue;
      }
      const col = this.ctrl.collisionWorld.get(body.colliderId);
      if (!col) continue;
      body.velocity.y += body.gravity * dt;
      body.integrate(dt);
      body.contactMesh = null;
      if (isSphereBody(body)) {
        this.collideSphereMeshes(body, dt);
        this.collideSphereBoxes(body);
        this.collideSphereVehicleWheels(body);
        this.resolveBodyVsKinematicCapsule(body);
      } else if (isBoxBody(body)) {
        this.collideBoxMeshes(body, dt);
        this.collideBoxVehicleBoxes(body);
        this.collideBoxVehicleWheels(body);
        this.resolveBodyVsKinematicCapsule(body);
      }
      body.applyDamping(dt);
      this.clampSpeed(body);
    }
    this.rebuildDynamicBroadphase();
    this.collideSpherePairs();
    this.collideBoxPairs();
    for (const body of this.list) {
      if (!body.sleeping) this.clampSpeed(body);
    }
  }
  /** 休眠刚体与车辆底盘 / 车轮球接触检测。 */
  collideSleepingBodyWithVehicles(body) {
    if (isBoxBody(body)) {
      this.collideBoxVehicleBoxes(body);
      this.collideBoxVehicleWheels(body);
    } else if (isSphereBody(body)) {
      this.collideSphereVehicleBoxes(body);
      this.collideSphereVehicleWheels(body);
    }
  }
  /** 按速度阈值累计 / 清除休眠计时。 */
  updateSleep(body, dt) {
    if (!body.canSleep) {
      if (body.sleeping) body.wakeUp();
      return;
    }
    if (body.sleeping) return;
    const linSq = body.velocity.lengthSq();
    const angSq = body.angularVelocity.lengthSq();
    const linMax = SLEEP_LINEAR * SLEEP_LINEAR;
    const angMax = SLEEP_ANGULAR * SLEEP_ANGULAR;
    const wakeLin = linMax * SLEEP_WAKE_FACTOR * SLEEP_WAKE_FACTOR;
    const wakeAng = angMax * SLEEP_WAKE_FACTOR * SLEEP_WAKE_FACTOR;
    if (linSq > wakeLin || angSq > wakeAng) {
      body.sleepTimer = 0;
      return;
    }
    if (linSq <= linMax && angSq <= angMax) {
      body.sleepTimer += dt;
      if (body.sleepTimer >= SLEEP_TIME) body.putToSleep();
    }
  }
  /** 双方都休眠则跳过；一方休眠时按需唤醒后再解算。 */
  shouldSolveDynamicPair(a, b) {
    if (a.sleeping && b.sleeping) return false;
    if (a.sleeping || b.sleeping) {
      const awake = a.sleeping ? b : a;
      const sleeper = a.sleeping ? a : b;
      if (awake.isRestingCandidate(SLEEP_LINEAR, SLEEP_ANGULAR)) return false;
      sleeper.wakeUp();
      return true;
    }
    return true;
  }
  /**
   * 球 vs 静态/平台网格：收集接触 → 过深则硬推 → 否则冲量求解 + 位置修正。
   * 跳过车辆外观 mesh，改由底盘盒处理。
   */
  collideSphereMeshes(body, dt) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const meshes = this.ctrl.collisionWorld.queryMeshes(worldCol, { skipIds: this.skipVehicleMeshes });
    let rawCount = 0;
    let deepest = 0;
    let deepestMesh = null;
    for (const mesh of meshes) {
      const before = rawCount;
      rawCount = collectSphereVsMeshContacts(
        body.position,
        body.radius,
        mesh,
        this.temps,
        this.raw,
        rawCount,
        MAX_RAW2
      );
      for (let i = before; i < rawCount; i++) {
        if (this.raw[i].penetration > deepest) {
          deepest = this.raw[i].penetration;
          deepestMesh = mesh;
        }
      }
    }
    if (rawCount === 0) return;
    body.contactMesh = deepestMesh;
    const maxPush = body.radius * MAX_PUSH_RATIO;
    if (deepest > maxPush) {
      let nx = 0, ny = 0, nz = 0, w = 0;
      for (let i = 0; i < rawCount; i++) {
        const p = Math.max(this.raw[i].penetration, 0);
        nx += this.raw[i].normal.x * p;
        ny += this.raw[i].normal.y * p;
        nz += this.raw[i].normal.z * p;
        w += p;
      }
      if (w > 1e-8) {
        this.temps.normal.set(nx / w, ny / w, nz / w);
        if (this.temps.normal.lengthSq() > 1e-8) {
          this.temps.normal.normalize();
          body.position.addScaledVector(
            this.temps.normal,
            Math.min(deepest, maxPush, this.maxPositionCorrection(body, dt))
          );
        }
      }
      return;
    }
    this.solveMeshManifolds(body, rawCount, dt);
    this.applySphereSupportRolling(body);
  }
  /** 盒 vs 静态/平台网格：复用 VehicleCollision 收集接触后冲量求解。 */
  collideBoxMeshes(body, dt) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const meshes = this.ctrl.collisionWorld.queryMeshes(worldCol, { skipIds: this.skipVehicleMeshes });
    if (!meshes.length) return;
    this.manifolds.length = 0;
    let deepest = 0;
    let deepestMesh = null;
    for (const mesh of meshes) {
      const found = this.boxMeshCollision.detect(body, mesh);
      if (!found.length) continue;
      let meshDeep = 0;
      for (const m of found) {
        this.manifolds.push(m);
        for (const p of m.contacts) {
          if (p.penetration > meshDeep) meshDeep = p.penetration;
        }
      }
      if (meshDeep > deepest) {
        deepest = meshDeep;
        deepestMesh = mesh;
      }
    }
    if (!this.manifolds.length) return;
    body.contactMesh = deepestMesh;
    const maxPush = body.characteristicExtent() * MAX_PUSH_RATIO;
    if (deepest > maxPush) {
      let nx = 0, ny = 0, nz = 0, w = 0;
      for (const m of this.manifolds) {
        for (const p of m.contacts) {
          const pen = Math.max(p.penetration, 0);
          nx += m.normal.x * pen;
          ny += m.normal.y * pen;
          nz += m.normal.z * pen;
          w += pen;
        }
      }
      if (w > 1e-8) {
        this.temps.normal.set(nx / w, ny / w, nz / w);
        if (this.temps.normal.lengthSq() > 1e-8) {
          this.temps.normal.normalize();
          body.position.addScaledVector(
            this.temps.normal,
            Math.min(deepest, maxPush, this.maxPositionCorrection(body, dt))
          );
        }
      }
      return;
    }
    const cache = this.contactCaches.get(body);
    cache?.match(this.manifolds);
    this.contactSolver.solveVelocity(body, this.manifolds, dt);
    cache?.save(this.manifolds);
    this.correctMeshPenetration(body, this.manifolds, dt);
  }
  /** 球网格接触：归约 → 冲量 → 位置修正。 */
  solveMeshManifolds(body, rawCount, dt) {
    this.manifolds.length = 0;
    reduceContacts(this.raw, rawCount, body, this.manifolds);
    const cache = this.contactCaches.get(body);
    cache?.match(this.manifolds);
    this.contactSolver.solveVelocity(body, this.manifolds, dt);
    cache?.save(this.manifolds);
    this.correctMeshPenetration(body, this.manifolds, dt);
  }
  /** 每个流形只按最深接触修正一次位置。 */
  correctMeshPenetration(body, manifolds, dt) {
    const skin = contactSkinForExtent(body.characteristicExtent());
    const maxCorrection = this.maxPositionCorrection(body, dt);
    for (const manifold of manifolds) {
      let deepest = 0;
      for (const point of manifold.contacts) {
        if (point.penetration > deepest) deepest = point.penetration;
      }
      const correction = Math.min((deepest - skin) * POS_CORRECT, maxCorrection);
      if (correction > 0) body.position.addScaledVector(manifold.normal, correction);
    }
  }
  /** 按特征尺寸限制单子步的最大位置修正。 */
  maxPositionCorrection(body, dt) {
    return body.characteristicExtent() * MAX_DEPENETRATION_EXTENTS * dt;
  }
  /**
   * 在支撑面上将角速度拉向无滑滚动：ω → n × v_tang / R。
   * 补强摩擦迭代不足时的滚动手感。
   */
  applySphereSupportRolling(body) {
    let bestY = SUPPORT_Y2;
    let support = null;
    for (const m of this.manifolds) {
      if (m.normal.y > bestY) {
        bestY = m.normal.y;
        support = m;
      }
    }
    if (!support) return;
    const n = support.normal;
    this.temps.offset.copy(body.velocity).addScaledVector(n, -body.velocity.dot(n));
    if (this.temps.offset.lengthSq() < 1e-10) return;
    this.rollTarget.copy(n).cross(this.temps.offset).multiplyScalar(1 / Math.max(body.radius, 1e-6));
    body.angularVelocity.lerp(this.rollTarget, ROLL_BLEND);
  }
  /** 球 vs 车辆底盘 / 动态盒 OBB。 */
  collideSphereBoxes(body) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const boxes = this.ctrl.collisionWorld.query(worldCol, { kinds: ["box"] });
    for (const box of boxes) {
      const vehicle = box.userData;
      const chassis = vehicle?.chassisBody;
      if (chassis) {
        this.resolveSphereVsObbBody(body, chassis);
        continue;
      }
      const other = box.userData;
      if (isBoxBody(other) && other !== body) {
        this.resolveSphereVsObbBody(body, other);
      }
    }
  }
  /** 球 vs 车辆底盘（休眠体专用，不测其它动态盒）。 */
  collideSphereVehicleBoxes(body) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const boxes = this.ctrl.collisionWorld.query(worldCol, { kinds: ["box"] });
    for (const box of boxes) {
      const vehicle = box.userData;
      const chassis = vehicle?.chassisBody;
      if (!chassis) continue;
      if (this.resolveSphereVsObbBody(body, chassis)) body.wakeUp();
    }
  }
  /** 球与单个 OBB 刚体：推出球并双方在接触点施冲量；有接触返回 true。 */
  resolveSphereVsObbBody(body, other) {
    if (!collideSphereVsObb(
      body.position,
      body.radius,
      other.position,
      other.quaternion,
      other.halfExtents,
      this.temps
    )) return false;
    body.getVelocityAtPoint(this.temps.contact, this.bodyVel);
    other.getVelocityAtPoint(this.temps.contact, this.temps.boxVel);
    this.temps.offset.copy(this.bodyVel).sub(this.temps.boxVel);
    const vn = this.temps.offset.dot(this.temps.normal);
    if (vn >= 0) return true;
    const deltaVn = -vn * (1 + body.restitution);
    this.temps.impulse.copy(this.temps.normal).multiplyScalar(deltaVn * body.mass);
    body.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    this.temps.impulse.multiplyScalar(-1);
    other.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    return true;
  }
  /** 动态盒 vs 车辆底盘 OBB；有接触时唤醒休眠盒。 */
  collideBoxVehicleBoxes(body) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const boxes = this.ctrl.collisionWorld.query(worldCol, { kinds: ["box"] });
    for (const box of boxes) {
      if (box.id === body.colliderId) continue;
      const vehicle = box.userData;
      const chassis = vehicle?.chassisBody;
      if (!chassis) continue;
      if (resolveObbObb(body, chassis, this.obbTemps)) body.wakeUp();
    }
  }
  /** 动态球 vs 车轮运动学球。 */
  collideSphereVehicleWheels(body) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const spheres = this.ctrl.collisionWorld.query(worldCol, {
      kinds: ["sphere"],
      motion: ["kinematic", "static"]
    });
    for (const col of spheres) {
      if (col.shape.kind !== "sphere") continue;
      const wheel = this.asVehicleWheel(col.userData);
      if (!wheel) continue;
      if (this.resolveSphereVsVehicleWheel(
        body,
        wheel.vehicle,
        wheel.wheelIndex,
        col.shape.radius
      )) {
        body.wakeUp();
      }
    }
  }
  /** 动态盒 vs 车轮运动学球。 */
  collideBoxVehicleWheels(body) {
    const worldCol = this.ctrl.collisionWorld.get(body.colliderId);
    if (!worldCol) return;
    const spheres = this.ctrl.collisionWorld.query(worldCol, {
      kinds: ["sphere"],
      motion: ["kinematic", "static"]
    });
    for (const col of spheres) {
      if (col.shape.kind !== "sphere") continue;
      const wheel = this.asVehicleWheel(col.userData);
      if (!wheel) continue;
      if (this.resolveBoxVsVehicleWheel(
        body,
        wheel.vehicle,
        wheel.wheelIndex,
        col.shape.radius
      )) {
        body.wakeUp();
      }
    }
  }
  /** 识别车轮球 userData。 */
  asVehicleWheel(userData) {
    if (!userData || typeof userData !== "object") return null;
    const data = userData;
    if (!data.vehicle?.chassisBody || typeof data.wheelIndex !== "number") return null;
    return data;
  }
  /**
   * 由底盘位姿 + 悬挂长度推算轮心。
   * 成功时写入 wheelCenter，返回实际使用的半径。
   */
  getWheelCenterWS(vehicle, wheelIndex, registeredRadius) {
    const chassis = vehicle.chassisBody;
    const wheel = vehicle.vehicleController.wheelAt(wheelIndex);
    if (!wheel) return null;
    this.wheelCenter.copy(wheel.connectionPoint).applyQuaternion(chassis.quaternion).add(chassis.position);
    this.wheelDir.copy(wheel.direction).applyQuaternion(chassis.quaternion);
    const dirLen = this.wheelDir.length();
    if (dirLen > 1e-8) this.wheelCenter.addScaledVector(this.wheelDir, wheel.suspensionLength / dirLen);
    return Math.max(1e-4, registeredRadius > 0 ? registeredRadius : wheel.radius);
  }
  /**
   * 动态球 vs 单轮：只推开球，冲量回写底盘。
   * 法线由轮心指向球。
   */
  resolveSphereVsVehicleWheel(body, vehicle, wheelIndex, registeredRadius) {
    const chassis = vehicle.chassisBody;
    const radius = this.getWheelCenterWS(vehicle, wheelIndex, registeredRadius);
    if (radius == null) return false;
    this.temps.offset.subVectors(body.position, this.wheelCenter);
    const dist = this.temps.offset.length();
    const minDist = body.radius + radius;
    if (dist >= minDist) return false;
    if (dist > 1e-8) this.temps.normal.copy(this.temps.offset).multiplyScalar(1 / dist);
    else this.temps.normal.set(0, 1, 0);
    const depth = minDist - dist;
    body.position.addScaledVector(this.temps.normal, depth);
    this.temps.contact.copy(this.wheelCenter).addScaledVector(this.temps.normal, radius);
    body.getVelocityAtPoint(this.temps.contact, this.bodyVel);
    chassis.getVelocityAtPoint(this.temps.contact, this.temps.boxVel);
    this.temps.offset.copy(this.bodyVel).sub(this.temps.boxVel);
    const vn = this.temps.offset.dot(this.temps.normal);
    if (vn >= 0) return true;
    const deltaVn = -vn * (1 + body.restitution);
    this.temps.impulse.copy(this.temps.normal).multiplyScalar(deltaVn * body.mass);
    body.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    this.temps.impulse.multiplyScalar(-1);
    chassis.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    return true;
  }
  /**
   * 动态盒 vs 单轮：用球-OBB 测重叠，将本应推开轮球的位移反加到盒上，冲量回写底盘。
   * collideSphereVsObb 的法线由盒指向轮。
   */
  resolveBoxVsVehicleWheel(body, vehicle, wheelIndex, registeredRadius) {
    const chassis = vehicle.chassisBody;
    const radius = this.getWheelCenterWS(vehicle, wheelIndex, registeredRadius);
    if (radius == null) return false;
    this.wheelPosBefore.copy(this.wheelCenter);
    if (!collideSphereVsObb(
      this.wheelCenter,
      radius,
      body.position,
      body.quaternion,
      body.halfExtents,
      this.temps
    )) {
      this.wheelCenter.copy(this.wheelPosBefore);
      return false;
    }
    this.temps.offset.subVectors(this.wheelCenter, this.wheelPosBefore);
    body.position.sub(this.temps.offset);
    this.wheelCenter.copy(this.wheelPosBefore);
    body.getVelocityAtPoint(this.temps.contact, this.bodyVel);
    chassis.getVelocityAtPoint(this.temps.contact, this.temps.boxVel);
    this.temps.offset.copy(this.temps.boxVel).sub(this.bodyVel);
    const vn = this.temps.offset.dot(this.temps.normal);
    if (vn >= 0) return true;
    const deltaVn = -vn * (1 + body.restitution);
    this.temps.impulse.copy(this.temps.normal).multiplyScalar(deltaVn * body.mass);
    chassis.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    this.temps.impulse.multiplyScalar(-1);
    body.applyImpulseAtPoint(this.temps.impulse, this.temps.contact);
    return true;
  }
  /** 球与球两两求解（宽相位筛对后窄相）。 */
  collideSpherePairs() {
    for (const [i, j] of this.iterDynamicBroadphasePairs()) {
      const a = this.list[i];
      const b = this.list[j];
      if (!isSphereBody(a) || !isSphereBody(b)) continue;
      if (!this.shouldSolveDynamicPair(a, b)) continue;
      resolveSphereSphere(a, b, this.temps, 0.5 * (a.restitution + b.restitution));
    }
  }
  /** 盒与盒两两 OBB 求解（宽相位筛对后窄相）。 */
  collideBoxPairs() {
    for (const [i, j] of this.iterDynamicBroadphasePairs()) {
      const a = this.list[i];
      const b = this.list[j];
      if (!isBoxBody(a) || !isBoxBody(b)) continue;
      if (!this.shouldSolveDynamicPair(a, b)) continue;
      resolveObbObb(a, b, this.obbTemps);
    }
  }
  /** 重建 XZ 网格宽相位；单元尺寸随最大特征体自适应。 */
  rebuildDynamicBroadphase() {
    const n = this.list.length;
    this.broadphaseGrid.clear();
    if (n === 0) return;
    while (this.bodyAabbMin.length < n) {
      this.bodyAabbMin.push(new THREE21.Vector3());
      this.bodyAabbMax.push(new THREE21.Vector3());
    }
    let maxExtent = 0.5;
    for (let i = 0; i < n; i++) {
      maxExtent = Math.max(maxExtent, this.list[i].characteristicExtent());
      this.setBodyAabb(this.list[i], this.bodyAabbMin[i], this.bodyAabbMax[i]);
    }
    this.broadphaseCellSize = Math.max(1, maxExtent * BROADPHASE_CELL_SCALE);
    const invCell = 1 / this.broadphaseCellSize;
    for (let i = 0; i < n; i++) {
      const min = this.bodyAabbMin[i];
      const max = this.bodyAabbMax[i];
      const ix0 = Math.floor(min.x * invCell);
      const ix1 = Math.floor(max.x * invCell);
      const iz0 = Math.floor(min.z * invCell);
      const iz1 = Math.floor(max.z * invCell);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = `${ix},${iz}`;
          let bucket = this.broadphaseGrid.get(key);
          if (!bucket) {
            bucket = [];
            this.broadphaseGrid.set(key, bucket);
          }
          bucket.push(i);
        }
      }
    }
  }
  /** 遍历宽相位候选对（同格 + 相邻格，AABB 重叠，i < j 去重）。 */
  *iterDynamicBroadphasePairs() {
    const n = this.list.length;
    if (n < 2) return;
    this.broadphasePairSeen.clear();
    for (const [key, bucketA] of this.broadphaseGrid) {
      const comma = key.indexOf(",");
      const ix = Number(key.slice(0, comma));
      const iz = Number(key.slice(comma + 1));
      for (let dz = 0; dz <= 1; dz++) {
        for (let dx = 0; dx <= 1; dx++) {
          const bucketB = this.broadphaseGrid.get(`${ix + dx},${iz + dz}`);
          if (!bucketB) continue;
          for (const i of bucketA) {
            for (const j of bucketB) {
              if (i >= j) continue;
              const pairKey = i * n + j;
              if (this.broadphasePairSeen.has(pairKey)) continue;
              this.broadphasePairSeen.add(pairKey);
              if (!this.bodyAabbOverlap(i, j)) continue;
              yield [i, j];
            }
          }
        }
      }
    }
  }
  /** 写入刚体世界 AABB；盒体将 OBB 三轴投影后取包络（宽相位粗测用，偏保守）。 */
  setBodyAabb(body, min, max) {
    if (isSphereBody(body)) {
      const r = body.radius;
      min.set(body.position.x - r, body.position.y - r, body.position.z - r);
      max.set(body.position.x + r, body.position.y + r, body.position.z + r);
      return;
    }
    if (isBoxBody(body)) {
      const hx = body.halfExtents.x;
      const hy = body.halfExtents.y;
      const hz = body.halfExtents.z;
      this.broadphaseAxisX.set(hx, 0, 0).applyQuaternion(body.quaternion);
      this.broadphaseAxisY.set(0, hy, 0).applyQuaternion(body.quaternion);
      this.broadphaseAxisZ.set(0, 0, hz).applyQuaternion(body.quaternion);
      const ex = Math.abs(this.broadphaseAxisX.x) + Math.abs(this.broadphaseAxisY.x) + Math.abs(this.broadphaseAxisZ.x);
      const ey = Math.abs(this.broadphaseAxisX.y) + Math.abs(this.broadphaseAxisY.y) + Math.abs(this.broadphaseAxisZ.y);
      const ez = Math.abs(this.broadphaseAxisX.z) + Math.abs(this.broadphaseAxisY.z) + Math.abs(this.broadphaseAxisZ.z);
      min.set(body.position.x - ex, body.position.y - ey, body.position.z - ez);
      max.set(body.position.x + ex, body.position.y + ey, body.position.z + ez);
    }
  }
  /** 宽相位候选对 AABB 三轴重叠检测；未通过则跳过窄相。 */
  bodyAabbOverlap(i, j) {
    const aMin = this.bodyAabbMin[i];
    const aMax = this.bodyAabbMax[i];
    const bMin = this.bodyAabbMin[j];
    const bMax = this.bodyAabbMax[j];
    return aMin.x <= bMax.x && aMax.x >= bMin.x && aMin.y <= bMax.y && aMax.y >= bMin.y && aMin.z <= bMax.z && aMax.z >= bMin.z;
  }
  /**
   * 人物分步移动时与动态体接触。
   * 胶囊只做位置推出；对刚体施水平单向冲量（不回推人物速度）。
   */
  collideWithCapsule() {
    if (this.ctrl.controllerMode === 1 || this.ctrl.skipCapsuleCollision) return;
    const cap = this.ctrl.playerCapsule;
    const info = cap?.capsuleInfo;
    if (!cap || !info) return;
    const maxSep = info.radius * CHAR_SEP_MAX_RADIUS;
    const playerVel = this.ctrl.playerVelocity;
    const charMass = this.characterPushMass();
    for (const body of this.list) {
      const hit = this.queryCapsuleBodyOverlap(cap, info, body);
      if (!hit || hit.depth <= 0) continue;
      this.temps.normal.copy(hit.normal);
      if (!this.ctrl.isFlying) {
        this.temps.normal.y = 0;
        if (this.temps.normal.lengthSq() < 1e-8) {
          this.temps.normal.set(
            body.position.x - cap.position.x,
            0,
            body.position.z - cap.position.z
          );
          if (this.temps.normal.lengthSq() < 1e-8) this.temps.normal.set(1, 0, 0);
        }
        this.temps.normal.normalize();
      }
      const sep = Math.min(hit.depth, maxSep);
      cap.position.addScaledVector(this.temps.normal, -sep);
      cap.updateMatrixWorld();
      body.getVelocityAtPoint(hit.contact, this.bodyVel);
      this.temps.offset.set(playerVel.x - this.bodyVel.x, 0, playerVel.z - this.bodyVel.z);
      const deltaVel = this.temps.offset.dot(this.temps.normal);
      if (deltaVel <= 0) continue;
      const massRatio = body.mass * charMass / (body.mass + charMass);
      this.temps.impulse.copy(this.temps.normal).multiplyScalar(deltaVel * massRatio);
      this.temps.impulse.y = 0;
      body.applyImpulseAtPoint(this.temps.impulse, hit.contact);
    }
  }
  /** 查询胶囊与单个动态体的重叠；normal 由胶囊指向刚体。 */
  queryCapsuleBodyOverlap(cap, info, body) {
    if (isSphereBody(body)) {
      const depth = capsuleSphereOverlap(cap, info, body.position, body.radius, this.capsuleTemps);
      if (depth <= 0) return null;
      this.contactPoint.copy(this.capsuleTemps.closestSeg).addScaledVector(
        this.capsuleTemps.closestTri,
        info.radius
      );
      return {
        depth,
        normal: this.capsuleTemps.closestTri,
        contact: this.contactPoint
      };
    }
    if (isBoxBody(body)) {
      const depth = capsuleObbOverlap(
        cap,
        info,
        body.position,
        body.quaternion,
        body.halfExtents,
        this.capsuleTemps
      );
      if (depth <= 0) return null;
      this.contactPoint.copy(this.capsuleTemps.closestSeg).addScaledVector(
        this.capsuleTemps.closestTri,
        info.radius
      );
      return {
        depth,
        normal: this.capsuleTemps.closestTri,
        contact: this.contactPoint
      };
    }
    return null;
  }
  /**
   * 物理子步：胶囊视为运动学障碍（无限质量），只推出刚体并去掉侵入法向速度。
   */
  resolveBodyVsKinematicCapsule(body) {
    const cap = this.ctrl.playerCapsule;
    const info = cap?.capsuleInfo;
    if (!cap || !info || this.ctrl.controllerMode === 1) return;
    const hit = this.queryCapsuleBodyOverlap(cap, info, body);
    if (!hit || hit.depth <= 0) return;
    this.temps.normal.copy(hit.normal);
    if (!this.ctrl.isFlying && Math.abs(this.temps.normal.y) > 0.35) {
      this.temps.normal.y *= 0.15;
      if (this.temps.normal.lengthSq() > 1e-8) this.temps.normal.normalize();
      else {
        this.temps.normal.set(
          body.position.x - cap.position.x,
          0,
          body.position.z - cap.position.z
        );
        if (this.temps.normal.lengthSq() < 1e-8) return;
        this.temps.normal.normalize();
      }
    }
    const sep = Math.min(hit.depth, info.radius * CHAR_SEP_MAX_RADIUS);
    body.position.addScaledVector(this.temps.normal, sep * KIN_CAPSULE_BAUMGARTE);
    body.getVelocityAtPoint(hit.contact, this.bodyVel);
    const vn = this.bodyVel.dot(this.temps.normal);
    if (vn < 0) {
      this.temps.impulse.copy(this.temps.normal).multiplyScalar(-vn * body.mass);
      body.applyImpulseAtPoint(this.temps.impulse, hit.contact);
    }
  }
  /** 限制线速度 / 角速度，避免异常弹出。 */
  clampSpeed(body) {
    const extent = body.characteristicExtent();
    const maxSpeed = Math.max(Math.abs(body.gravity) * MAX_SPEED_GRAVITY, extent * 80);
    const speed = body.velocity.length();
    if (speed > maxSpeed) body.velocity.multiplyScalar(maxSpeed / speed);
    const maxAng = maxSpeed / Math.max(extent, 1e-4);
    const ang = body.angularVelocity.length();
    if (ang > maxAng) body.angularVelocity.multiplyScalar(maxAng / ang);
  }
  /** 刚体停在运动学网格上时按平台 prev→current 矩阵带走；位移过大则回退。 */
  applyKinematicCarry(body) {
    if (body.sleeping || !body.contactMesh) return;
    const entry = this.ctrl.getKinematicColliderEntries().find((e) => e.mesh === body.contactMesh);
    if (!entry) return;
    this.carryPrevInv.copy(entry.prevWorldMatrix).invert();
    this.temps.before.copy(body.position);
    body.position.applyMatrix4(this.carryPrevInv).applyMatrix4(entry.source.matrixWorld);
    const maxCarry = body.characteristicExtent() * 8;
    if (body.position.distanceToSquared(this.temps.before) > maxCarry * maxCarry) {
      body.position.copy(this.temps.before);
    }
  }
};

// src/systems/ColliderRegistry.ts
import * as THREE23 from "three";

// src/collision/colliderBuild.ts
import * as THREE22 from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
function isExcludedFromCollider(object) {
  let current = object;
  while (current) {
    if (current.userData.excludeFromCollider === true) return true;
    current = current.parent;
  }
  return false;
}
function ensureAttributesMinimal(geom) {
  if (!geom.attributes.position) return null;
  const position = geom.attributes.position.array;
  for (let i = 0; i < position.length; i++) {
    if (!Number.isFinite(position[i])) return null;
  }
  if (geom.attributes.position.count < 3) return null;
  if (!geom.attributes.normal) geom.computeVertexNormals();
  if (!geom.attributes.uv) {
    const count = geom.attributes.position.count;
    geom.setAttribute("uv", new THREE22.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geom;
}
function unifiedAttribute(collected) {
  const attrMap = /* @__PURE__ */ new Map();
  const attrConflict = /* @__PURE__ */ new Set();
  const required = /* @__PURE__ */ new Set(["position", "normal", "uv"]);
  for (const g of collected)
    for (const name of Object.keys(g.attributes))
      if (!required.has(name)) g.deleteAttribute(name);
  for (const g of collected) {
    for (const name of Object.keys(g.attributes)) {
      const attr = g.attributes[name];
      const ctor = attr.array.constructor;
      if (!attrMap.has(name)) {
        attrMap.set(name, { itemSize: attr.itemSize, arrayCtor: ctor, examples: 1, normalized: attr.normalized });
      } else {
        const m = attrMap.get(name);
        if (m.itemSize !== attr.itemSize || m.arrayCtor !== ctor || m.normalized !== attr.normalized) attrConflict.add(name);
        else m.examples++;
      }
    }
  }
  for (const name of attrConflict) {
    for (const g of collected) if (g.attributes[name]) g.deleteAttribute(name);
    attrMap.delete(name);
  }
  for (const [name, meta] of attrMap) {
    for (const g of collected) {
      if (!g.attributes[name]) {
        const count = g.attributes.position.count;
        g.setAttribute(name, new THREE22.BufferAttribute(new meta.arrayCtor(count * meta.itemSize), meta.itemSize, meta.normalized));
      }
    }
  }
  return collected;
}
function collectWorldSpaceGeometries(sources) {
  const collected = [];
  const collectMesh = (mesh) => {
    try {
      let geom = mesh.geometry.clone();
      geom.applyMatrix4(mesh.matrixWorld);
      if (geom.index) geom = geom.toNonIndexed();
      const safe = ensureAttributesMinimal(geom);
      if (safe) collected.push(safe);
    } catch (e) {
      console.warn("\u5904\u7406\u7F51\u683C\u65F6\u51FA\u9519\uFF1A", mesh, e);
    }
  };
  for (const obj of sources) {
    obj.updateMatrixWorld(true);
    obj.traverse((c) => {
      const a = c;
      if ((a.isMesh || a.isLineSegments) && a.geometry && c.name !== "capsule" && !isExcludedFromCollider(c)) collectMesh(a);
    });
  }
  return collected;
}
var _rtcTranslation = new THREE22.Matrix4();
var _rtcCenter = new THREE22.Vector3();
function recenterGeometry(geometry, target) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.isEmpty()) {
    target.set(0, 0, 0);
    return target;
  }
  box.getCenter(target);
  if (target.lengthSq() === 0) return target;
  geometry.translate(-target.x, -target.y, -target.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return target;
}
function makeDebugMesh(geometry, localSpace) {
  const mesh = new THREE22.Mesh(
    geometry,
    new THREE22.MeshBasicMaterial({
      opacity: 0.5,
      transparent: true,
      wireframe: true,
      depthTest: true,
      side: THREE22.DoubleSide
    })
  );
  mesh.raycast = acceleratedRaycast;
  if (localSpace) {
    mesh.matrixAutoUpdate = false;
  } else {
    mesh.layers.enable(1);
  }
  return mesh;
}
function buildStaticMergedMesh(sources) {
  const list = Array.isArray(sources) ? sources : [sources];
  let collected = collectWorldSpaceGeometries(list);
  if (!collected.length) return null;
  collected = unifiedAttribute(collected);
  const merged = BufferGeometryUtils.mergeGeometries(collected, false);
  if (!merged) {
    console.error("\u5408\u5E76\u51E0\u4F55\u5931\u8D25");
    return null;
  }
  return { mesh: makeDebugMesh(merged, false), geometry: merged };
}
function buildKinematicMergedMesh(source) {
  source.updateMatrixWorld(true);
  let collected = collectWorldSpaceGeometries([source]);
  if (!collected.length) return null;
  collected = unifiedAttribute(collected);
  const merged = BufferGeometryUtils.mergeGeometries(collected, false);
  if (!merged) {
    console.error("\u5408\u5E76\u8FD0\u52A8\u5B66\u51E0\u4F55\u5931\u8D25");
    return null;
  }
  const rtcCenter = recenterGeometry(merged, _rtcCenter);
  const bakeInverse = new THREE22.Matrix4().copy(source.matrixWorld).invert();
  bakeInverse.multiply(_rtcTranslation.makeTranslation(rtcCenter.x, rtcCenter.y, rtcCenter.z));
  const mesh = makeDebugMesh(merged, true);
  mesh.matrix.copy(source.matrixWorld).multiply(bakeInverse);
  mesh.updateMatrixWorld(true);
  return { mesh, geometry: merged, bakeInverse };
}
function attachBoundsTree(geometry, options) {
  const maxDepth = options.maxDepth;
  const sync = () => {
    const bvh = maxDepth != null ? new MeshBVH(geometry, { maxDepth }) : new MeshBVH(geometry);
    geometry.boundsTree = bvh;
    options.onReady(bvh);
  };
  if (!options.useWorker || !options.workerPool) {
    sync();
    return;
  }
  void options.workerPool.generate(geometry).then((bvh) => {
    if (options.onStale?.()) return;
    geometry.boundsTree = bvh;
    options.onReady(bvh);
  }).catch((error) => {
    if (options.onStale?.()) return;
    console.warn("\u5F02\u6B65\u6784\u5EFA BVH \u5931\u8D25\uFF0C\u56DE\u9000\u5230\u4E3B\u7EBF\u7A0B\uFF1A", error);
    sync();
  });
}

// src/systems/ColliderRegistry.ts
var warnedDynamicMesh = false;
var ColliderRegistry = class {
  constructor(ctrl) {
    this.kinematicColliders = [];
    // 需每帧跟随的运动学项
    /** id → handle 元数据 */
    this.handles = /* @__PURE__ */ new Map();
    /** 静态构建代数：异步 BVH 完成时若代数变了则丢弃 */
    this.buildGens = /* @__PURE__ */ new Map();
    this._contentScale = new THREE23.Vector3();
    this._contentOffsetMatrix = new THREE23.Matrix4();
    /** 静态 / 运动学 mesh 碰撞线框开关。 */
    this.debugVisible = false;
    this.ctrl = ctrl;
  }
  /** 返回碰撞 mesh 调试开关。 */
  getDebugVisible() {
    return this.debugVisible;
  }
  /** 切换静态 / 运动学 mesh 碰撞线框。 */
  setDebugVisible(visible) {
    this.debugVisible = visible;
    this.syncDebugVisibility();
  }
  /** 同步已就绪碰撞 mesh 的调试显隐。 */
  syncDebugVisibility() {
    const synced = /* @__PURE__ */ new Set();
    for (const handle of this.handles.values()) {
      const mesh = handle.collisionMesh;
      if (!mesh || synced.has(mesh)) continue;
      synced.add(mesh);
      this.syncDebugMesh(mesh);
    }
  }
  /** 按 desc 创建碰撞体；校验 motion/shape 约束后分派到 mesh/box/sphere。 */
  add(desc) {
    if (desc.motion === "static" && desc.follow != null) {
      throw new Error("static collider \u4E0D\u80FD\u5E26 follow");
    }
    if (desc.motion === "dynamic" && desc.follow != null) {
      throw new Error("dynamic collider \u4E0D\u80FD\u5E26 follow");
    }
    if (desc.shape.kind === "mesh") {
      const hasSource = "source" in desc.shape && desc.shape.source != null;
      const hasMesh = "mesh" in desc.shape && desc.shape.mesh != null;
      if (hasSource === hasMesh) {
        throw new Error("mesh shape \u5FC5\u987B\u63D0\u4F9B source \u6216 mesh \u4E4B\u4E00");
      }
      if (desc.motion === "dynamic" && !warnedDynamicMesh) {
        warnedDynamicMesh = true;
        console.warn(
          "[three-player-controller] dynamic + mesh \u5141\u8BB8\u4F46\u4E0D\u63A8\u8350\uFF1A\u4E09\u89D2\u7F51\u683C\u65E0\u4F53\u79EF\uFF0C\u6613\u5361\u987F/\u7A7F\u900F\uFF1B\u52A8\u6001\u7269\u8BF7\u4F18\u5148 box/sphere\u3002"
        );
      }
    }
    switch (desc.shape.kind) {
      case "mesh":
        return this.addMesh(desc);
      case "box":
        return this.addBox(desc);
      case "sphere":
        return this.addSphere(desc);
      default:
        throw new Error("\u672A\u77E5 shape.kind");
    }
  }
  /** 按句柄或 id 移除；同步释放 mesh / 动态刚体与 CollisionWorld 登记。 */
  remove(handle) {
    const id = typeof handle === "number" ? handle : handle.id;
    if (id < 0) return;
    const meta = this.handles.get(id);
    const kin = this.kinematicColliders.find((e) => e.worldId === id);
    if (kin) {
      kin.buildId += 1;
      this.ctrl.scene.remove(kin.mesh);
      kin.mesh.geometry.dispose();
      kin.mesh.material.dispose();
      if (this.ctrl.activeKinematicCollider === kin) this.ctrl.activeKinematicCollider = null;
      this.kinematicColliders = this.kinematicColliders.filter((e) => e !== kin);
    } else if (meta?.collisionMesh) {
      this.ctrl.scene.remove(meta.collisionMesh);
      meta.collisionMesh.geometry.dispose();
      meta.collisionMesh.material.dispose();
    }
    const body = this.ctrl.dynamics.findByColliderId(id);
    if (body) {
      this.ctrl.dynamics.remove(body);
      this.handles.delete(id);
      this.buildGens.delete(id);
      return;
    }
    this.ctrl.collisionWorld.remove(id);
    this.handles.delete(id);
    this.buildGens.delete(id);
  }
  /** 清除碰撞体；可按 motion 过滤。 */
  clear(filter) {
    for (const id of this.ctrl.collisionWorld.idsByMotion(filter?.motion)) {
      this.remove(id);
    }
  }
  /** 按 follow/source Object3D 查找运动学项。 */
  findKinematicBySource(source) {
    return this.kinematicColliders.find((e) => e.source === source);
  }
  /**
   * 每帧同步运动学碰撞网格到 follow 的 matrixWorld。
   * 若人物站在平台上，用 prev→current 算出本帧应带走的 deltaPos / deltaRotY。
   */
  updateKinematicFollow() {
    const playerWorldPos = this.ctrl.playerCapsule?.position;
    for (const entry of this.kinematicColliders) {
      if (playerWorldPos) {
        const prevInv = new THREE23.Matrix4().copy(entry.prevWorldMatrix).invert();
        const playerInLocal = playerWorldPos.clone().applyMatrix4(prevInv);
        this.writeKinematicMeshMatrix(entry);
        const playerInNewWorld = playerInLocal.clone().applyMatrix4(entry.mesh.matrixWorld);
        entry.deltaPos.subVectors(playerInNewWorld, playerWorldPos);
      } else {
        this.writeKinematicMeshMatrix(entry);
        entry.deltaPos.set(0, 0, 0);
      }
      const prevEuler = new THREE23.Euler().setFromRotationMatrix(entry.prevWorldMatrix, "YXZ");
      const curEuler = new THREE23.Euler().setFromRotationMatrix(entry.mesh.matrixWorld, "YXZ");
      entry.deltaRotY = curEuler.y - prevEuler.y;
    }
  }
  /** 将 follow 世界矩阵（含 contentOffset / bakeInverse / contentScale）写入碰撞 mesh。 */
  writeKinematicMeshMatrix(entry) {
    entry.source.updateMatrixWorld(true);
    entry.mesh.matrix.copy(entry.source.matrixWorld);
    if (entry.contentOffset.lengthSq() > 0) {
      entry.mesh.matrix.multiply(
        this._contentOffsetMatrix.makeTranslation(
          entry.contentOffset.x,
          entry.contentOffset.y,
          entry.contentOffset.z
        )
      );
    }
    entry.mesh.matrix.multiply(entry.bakeInverse);
    const s = entry.contentScale;
    if (s !== 1) {
      entry.mesh.matrix.scale(this._contentScale.set(s, s, s));
    }
    entry.mesh.updateMatrixWorld(true);
  }
  /**
   * 运行时等比缩放已烘焙的运动学 mesh 碰撞（不重建 BVH）。
   * source 为注册时的 follow / vehicleGroup。
   */
  scaleKinematicContent(source, ratio) {
    if (!source || !Number.isFinite(ratio) || ratio === 1) return;
    const entry = this.kinematicColliders.find((e) => e.source === source);
    if (!entry) return;
    entry.contentScale *= ratio;
    entry.contentOffset.multiplyScalar(ratio);
    this.writeKinematicMeshMatrix(entry);
    entry.prevWorldMatrix.copy(entry.mesh.matrixWorld);
  }
  /** 运行时平移已烘焙的运动学 mesh 碰撞，不重建 BVH。 */
  translateKinematicContent(source, localOffset) {
    if (!source || !Number.isFinite(localOffset.lengthSq()) || localOffset.lengthSq() === 0) return;
    const entry = this.kinematicColliders.find((e) => e.source === source);
    if (!entry) return;
    entry.contentOffset.add(localOffset);
    this.writeKinematicMeshMatrix(entry);
    entry.prevWorldMatrix.copy(entry.mesh.matrixWorld);
  }
  /** 本帧物理用完后再提交平台矩阵，供下一帧算 delta。 */
  commitKinematicPrev() {
    for (const entry of this.kinematicColliders) {
      entry.prevWorldMatrix.copy(entry.mesh.matrixWorld);
    }
  }
  /** 是否已有至少一份带 BVH 的静态 mesh。 */
  isStaticUsable() {
    for (const col of this.ctrl.collisionWorld.query(
      { mask: 65535 },
      { motion: "static", kinds: ["mesh"] }
    )) {
      if (col.shape.kind === "mesh" && col.shape.mesh.geometry.boundsTree) {
        return true;
      }
    }
    return false;
  }
  /** 运动学项是否已就绪（BVH 可用）。 */
  isKinematicUsable(entry) {
    return entry.ready && Boolean(entry.mesh.geometry.boundsTree);
  }
  /** 写入 handles 并返回公开句柄。 */
  makeHandle(id, motion, follow, source, collisionMesh) {
    const h = { id, motion, follow, source, collisionMesh };
    this.handles.set(id, h);
    return h;
  }
  /** mesh：按 motion 走动态登记 / 运动学 / 静态合并。 */
  addMesh(desc) {
    const shape = desc.shape;
    if (desc.motion === "dynamic") {
      const mesh = "mesh" in shape && shape.mesh ? shape.mesh : (() => {
        throw new Error("dynamic + mesh \u8BF7\u4F20\u5165\u5DF2\u6709 mesh\uFF0C\u6216\u6539\u7528 box/sphere");
      })();
      const entry = this.ctrl.collisionWorld.add({
        motion: "dynamic",
        shape: { kind: "mesh", mesh },
        groups: desc.groups,
        mask: desc.mask,
        userData: desc.userData
      });
      return this.makeHandle(entry.id, "dynamic", null, null, mesh);
    }
    if (desc.motion === "kinematic") {
      return this.addKinematicMesh(desc);
    }
    const source = "source" in shape && shape.source ? shape.source : null;
    const readyMesh = "mesh" in shape && shape.mesh ? shape.mesh : null;
    if (readyMesh) {
      const entry = this.ctrl.collisionWorld.add({
        motion: "static",
        shape: { kind: "mesh", mesh: readyMesh },
        groups: desc.groups,
        mask: desc.mask,
        ready: Boolean(readyMesh.geometry.boundsTree),
        userData: desc.userData
      });
      this.syncDebugMesh(readyMesh);
      return this.makeHandle(entry.id, "static", null, null, readyMesh);
    }
    const built = buildStaticMergedMesh(source);
    if (!built) {
      console.warn("\u9759\u6001 mesh \u5408\u5E76\u5931\u8D25\uFF1A\u65E0\u53EF\u7528\u51E0\u4F55");
      return { id: -1, motion: "static", follow: null, source: null, collisionMesh: null };
    }
    const world = this.ctrl.collisionWorld.add({
      motion: "static",
      shape: { kind: "mesh", mesh: built.mesh },
      groups: desc.groups,
      mask: desc.mask,
      ready: false,
      // BVH 完成前不参与查询
      userData: desc.userData
    });
    const handle = this.makeHandle(
      world.id,
      "static",
      null,
      Array.isArray(source) ? source[0] ?? null : source,
      built.mesh
    );
    this.buildGens.set(world.id, 1);
    const gen = 1;
    attachBoundsTree(built.geometry, {
      useWorker: desc.useWorker,
      workerPool: this.ctrl.getBvhWorkerPool(),
      maxDepth: 100,
      onStale: () => this.buildGens.get(world.id) !== gen || this.ctrl.collisionWorld.get(world.id) == null,
      onReady: () => {
        if (this.buildGens.get(world.id) !== gen) return;
        this.ctrl.collisionWorld.setReady(world.id, true);
        this.syncDebugMesh(built.mesh);
      }
    });
    return handle;
  }
  /** 运动学 mesh：已有 mesh 或从 source 合并，并加入 kinematicColliders 跟随列表。 */
  addKinematicMesh(desc) {
    const shape = desc.shape;
    const follow = ("follow" in desc ? desc.follow : void 0) ?? ("source" in shape && !Array.isArray(shape.source) ? shape.source : void 0) ?? null;
    if ("mesh" in shape && shape.mesh) {
      const mesh = shape.mesh;
      mesh.matrixAutoUpdate = false;
      if (follow) {
        follow.updateMatrixWorld(true);
        mesh.matrix.copy(follow.matrixWorld);
        mesh.updateMatrixWorld(true);
      }
      const entry2 = {
        source: follow ?? mesh,
        mesh,
        contentScale: 1,
        contentOffset: new THREE23.Vector3(),
        bakeInverse: new THREE23.Matrix4(),
        prevWorldMatrix: new THREE23.Matrix4().copy(follow?.matrixWorld ?? mesh.matrixWorld),
        deltaPos: new THREE23.Vector3(),
        deltaRotY: 0,
        ready: Boolean(mesh.geometry.boundsTree),
        buildId: 1,
        worldId: 0
      };
      const world2 = this.ctrl.collisionWorld.add({
        motion: "kinematic",
        shape: { kind: "mesh", mesh },
        groups: desc.groups,
        mask: desc.mask,
        ready: entry2.ready,
        userData: entry2
      });
      entry2.worldId = world2.id;
      this.kinematicColliders.push(entry2);
      this.syncDebugMesh(mesh);
      return this.makeHandle(world2.id, "kinematic", follow, follow, mesh);
    }
    const sourceObj = shape.source;
    const root = Array.isArray(sourceObj) ? sourceObj[0] : sourceObj;
    if (!root) throw new Error("kinematic mesh \u9700\u8981 source");
    const existing = this.kinematicColliders.find((e) => e.source === (follow ?? root));
    if (existing) {
      return this.handles.get(existing.worldId) ?? this.makeHandle(existing.worldId, "kinematic", follow ?? root, root, existing.mesh);
    }
    const built = buildKinematicMergedMesh(root);
    if (!built) {
      console.warn("\u8FD0\u52A8\u5B66 mesh \u5408\u5E76\u5931\u8D25\uFF1A\u65E0\u53EF\u7528\u51E0\u4F55");
      return { id: -1, motion: "kinematic", follow: follow ?? root, source: root, collisionMesh: null };
    }
    const followTarget = follow ?? root;
    followTarget.updateMatrixWorld(true);
    const bakeInverse = new THREE23.Matrix4().copy(followTarget.matrixWorld).invert().multiply(built.mesh.matrix);
    const entry = {
      source: followTarget,
      mesh: built.mesh,
      contentScale: 1,
      contentOffset: new THREE23.Vector3(),
      bakeInverse,
      prevWorldMatrix: new THREE23.Matrix4().copy(built.mesh.matrixWorld),
      deltaPos: new THREE23.Vector3(),
      deltaRotY: 0,
      ready: !desc.useWorker,
      // Worker 时先不可用，onReady 再打开
      buildId: 1,
      worldId: 0
    };
    const world = this.ctrl.collisionWorld.add({
      motion: "kinematic",
      shape: { kind: "mesh", mesh: built.mesh },
      groups: desc.groups,
      mask: desc.mask,
      ready: entry.ready,
      userData: entry
    });
    entry.worldId = world.id;
    this.kinematicColliders.push(entry);
    const handle = this.makeHandle(world.id, "kinematic", followTarget, root, built.mesh);
    const buildId = entry.buildId;
    attachBoundsTree(built.geometry, {
      useWorker: desc.useWorker,
      workerPool: this.ctrl.getBvhWorkerPool(),
      onStale: () => entry.buildId !== buildId || !this.kinematicColliders.includes(entry),
      onReady: () => {
        if (entry.buildId !== buildId || !this.kinematicColliders.includes(entry)) return;
        entry.ready = true;
        this.ctrl.collisionWorld.setReady(entry.worldId, true);
        this.syncDebugMesh(built.mesh);
      }
    });
    return handle;
  }
  /** 按当前开关同步单个碰撞 mesh。 */
  syncDebugMesh(mesh) {
    if (this.debugVisible && mesh.geometry.boundsTree) {
      if (!this.ctrl.scene.children.includes(mesh)) this.ctrl.scene.add(mesh);
    } else {
      this.ctrl.scene.remove(mesh);
    }
  }
  /**
   * box：
   * - dynamic 且 simulate 默认 true → 创建 DynamicBoxBody
   * - dynamic 且 simulate: false → 仅登记（车辆底盘）
   * - static / kinematic → 仅登记
   */
  addBox(desc) {
    if (desc.motion === "dynamic" && desc.simulate !== false) {
      const body = this.ctrl.dynamics.addBox(desc);
      if (desc.groups != null) this.ctrl.collisionWorld.setGroups(body.colliderId, desc.groups);
      if (desc.mask != null) this.ctrl.collisionWorld.setMask(body.colliderId, desc.mask);
      if (desc.userData != null) this.ctrl.collisionWorld.setUserData(body.colliderId, desc.userData);
      return this.makeHandle(body.colliderId, "dynamic", null, null, null);
    }
    const shape = desc.shape;
    const half = shape.halfExtents.clone();
    const entry = this.ctrl.collisionWorld.add({
      motion: desc.motion,
      shape: { kind: "box", halfExtents: half },
      groups: desc.groups,
      mask: desc.mask,
      userData: desc.userData
    });
    return this.makeHandle(entry.id, desc.motion, null, null, null);
  }
  /**
   * sphere：dynamic 时创建 DynamicSphereBody；
   * static/kinematic 仅登记形状（供查询矩阵，无球刚体步进）。
   */
  addSphere(desc) {
    if (desc.motion === "dynamic") {
      const body = this.ctrl.dynamics.addSphere(desc);
      if (desc.groups != null) this.ctrl.collisionWorld.setGroups(body.colliderId, desc.groups);
      if (desc.mask != null) this.ctrl.collisionWorld.setMask(body.colliderId, desc.mask);
      if (desc.userData != null) this.ctrl.collisionWorld.setUserData(body.colliderId, desc.userData);
      return this.makeHandle(body.colliderId, "dynamic", null, null, null);
    }
    const shape = desc.shape;
    const entry = this.ctrl.collisionWorld.add({
      motion: desc.motion,
      shape: { kind: "sphere", radius: shape.radius },
      groups: desc.groups,
      mask: desc.mask,
      userData: desc.userData
    });
    return this.makeHandle(entry.id, desc.motion, null, null, null);
  }
};

// src/utils/BvhWorkerPool.ts
import { MeshBVH as MeshBVH2 } from "three-mesh-bvh";
var BvhWorkerPool = class {
  constructor() {
    this.worker = null;
    // 已创建的 Worker
    this.workerPromise = null;
    // 创建中的 Promise，避免重复加载
    this.queue = [];
    // 等待构建的任务
    this.pumping = false;
    // 是否正在消费队列
    this.disposed = false;
    // 是否已销毁
    this.workerDisabled = false;
    // 失败后禁用 Worker，后续一律同步构建
    this.workerBuildCount = 0;
    // Worker 构建次数
    this.syncBuildCount = 0;
    // 同步构建次数
    this.loggedWorkerReady = false;
  }
  // 是否已打印 Worker 就绪日志
  /** 将几何加入队列，返回构建完成的 MeshBVH。 */
  generate(geometry) {
    if (this.disposed) {
      return Promise.reject(new Error("BvhWorkerPool has been disposed."));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ geometry, resolve, reject });
      void this.pump();
    });
  }
  /** 销毁 Worker 并清空队列。 */
  dispose() {
    this.disposed = true;
    this.queue.length = 0;
    this.disableWorker();
    this.workerPromise = null;
  }
  /** 关闭 Worker，后续任务改走同步构建。 */
  disableWorker() {
    if (!this.workerDisabled && !this.disposed) {
      console.warn("[BVH] worker disabled, later builds use sync MeshBVH");
    }
    this.workerDisabled = true;
    this.worker?.dispose();
    this.worker = null;
    this.workerPromise = null;
  }
  /** 按间隔打印构建次数，避免每帧刷日志。 */
  logBuild(mode) {
    if (mode === "worker") {
      this.workerBuildCount += 1;
      if (this.workerBuildCount === 1 || this.workerBuildCount % 20 === 0) {
        console.info(`[BVH] worker build #${this.workerBuildCount}`);
      }
      return;
    }
    this.syncBuildCount += 1;
    if (this.syncBuildCount === 1 || this.syncBuildCount % 20 === 0) {
      console.info(`[BVH] sync build #${this.syncBuildCount}`);
    }
  }
  /** 懒加载并缓存 Worker；失败则返回 null。 */
  async ensureWorker() {
    if (this.workerDisabled) return null;
    if (this.worker) return this.worker;
    if (this.workerPromise) return this.workerPromise;
    this.workerPromise = this.loadWorkerCtor().then((GenerateMeshBVHWorker) => {
      if (this.disposed || this.workerDisabled || !GenerateMeshBVHWorker) return null;
      this.worker = new GenerateMeshBVHWorker();
      if (!this.loggedWorkerReady) {
        this.loggedWorkerReady = true;
        console.info("[BVH] worker ready");
      }
      return this.worker;
    }).catch((error) => {
      console.warn("[BVH] worker create failed, sync fallback", error);
      this.workerDisabled = true;
      return null;
    });
    return this.workerPromise;
  }
  /** 动态导入 GenerateMeshBVHWorker。 */
  async loadWorkerCtor() {
    const mod = await import("three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js");
    return mod.GenerateMeshBVHWorker;
  }
  /** 主线程同步构建。 */
  buildSync(geometry) {
    return new MeshBVH2(geometry);
  }
  /**
   * 在克隆几何上交给 Worker 构建，避免 transfer 抽空原 buffer。
   * 构建后把 position / index 写回原几何，供后续射线与 shapecast 使用。
   */
  async buildWithWorker(worker, geometry) {
    const clone = geometry.clone();
    const bvh = await worker.generate(clone);
    const position = clone.getAttribute("position");
    if (position?.array) {
      geometry.setAttribute("position", position);
    }
    if (clone.index) {
      geometry.setIndex(clone.index);
    }
    return bvh;
  }
  /** 让出一帧后再继续消费队列，避免连续同步构建卡住主线程。 */
  schedulePump() {
    const resume = () => {
      void this.pump();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(resume);
      return;
    }
    setTimeout(resume, 0);
  }
  /** 串行消费队列：优先 Worker，失败则同步回退并禁用 Worker。 */
  async pump() {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      while (this.queue.length && !this.disposed) {
        const item = this.queue.shift();
        if (!item) break;
        try {
          const worker = await this.ensureWorker();
          if (this.disposed) {
            item.reject(new Error("BvhWorkerPool has been disposed."));
            continue;
          }
          if (!worker) {
            this.logBuild("sync");
            item.resolve(this.buildSync(item.geometry));
            if (this.queue.length) this.schedulePump();
            break;
          }
          const bvh = await this.buildWithWorker(worker, item.geometry);
          this.logBuild("worker");
          item.resolve(bvh);
        } catch (error) {
          console.warn("[BVH] worker generate failed, switch to sync", error);
          this.disableWorker();
          try {
            this.logBuild("sync");
            item.resolve(this.buildSync(item.geometry));
          } catch (fallbackError) {
            item.reject(fallbackError ?? error);
          }
          if (this.queue.length) this.schedulePump();
          break;
        }
      }
    } finally {
      this.pumping = false;
    }
  }
};

// src/collision/CollisionWorld.ts
function defaultBits(motion) {
  switch (motion) {
    case "static":
      return {
        groups: CollisionGroup.DEFAULT,
        mask: CollisionGroup.DEBRIS | CollisionGroup.VEHICLE
      };
    case "kinematic":
      return {
        groups: CollisionGroup.DEFAULT,
        mask: CollisionGroup.DEBRIS | CollisionGroup.VEHICLE | CollisionGroup.CHARACTER
      };
    case "dynamic":
      return {
        groups: CollisionGroup.DEBRIS,
        mask: CollisionGroup.DEFAULT | CollisionGroup.VEHICLE | CollisionGroup.DEBRIS
      };
  }
}
function isCollider(filter) {
  return "id" in filter && "motion" in filter && "groups" in filter;
}
var CollisionWorld = class {
  constructor() {
    this.nextId = 1;
    // 递增 id
    this.colliders = /* @__PURE__ */ new Map();
  }
  // 已登记碰撞体
  /** 登记一条碰撞体，返回带 id 的条目。 */
  add(options) {
    const bits = defaultBits(options.motion);
    const entry = {
      id: this.nextId++,
      motion: options.motion,
      shape: options.shape,
      groups: options.groups ?? bits.groups,
      mask: options.mask ?? bits.mask,
      ready: options.ready ?? true,
      userData: options.userData
    };
    this.colliders.set(entry.id, entry);
    return entry;
  }
  /** 按 id 取碰撞体，不存在则返回 undefined。 */
  get(id) {
    return this.colliders.get(id);
  }
  /** 注销碰撞体。 */
  remove(id) {
    this.colliders.delete(id);
  }
  /** 标记 BVH / 资源是否可参与查询。 */
  setReady(id, ready) {
    const entry = this.colliders.get(id);
    if (entry) entry.ready = ready;
  }
  /** 覆盖碰撞掩码。 */
  setMask(id, mask) {
    const entry = this.colliders.get(id);
    if (entry) entry.mask = mask;
  }
  /** 覆盖业务分组。 */
  setGroups(id, groups) {
    const entry = this.colliders.get(id);
    if (entry) entry.groups = groups;
  }
  /** 覆盖 userData。 */
  setUserData(id, userData) {
    const entry = this.colliders.get(id);
    if (entry) entry.userData = userData;
  }
  /**
   * 查询可参与检测的碰撞体。
   * 完整 collider：双向 groups/mask；仅 mask：单向。自动跳过未 ready 与自身 id。
   */
  query(filter, options) {
    const skip = new Set(options?.skipIds);
    const self = isCollider(filter) ? filter : null;
    if (self) skip.add(self.id);
    const mask = filter.mask;
    const kinds = options?.kinds;
    const motions = options?.motion ? Array.isArray(options.motion) ? options.motion : [options.motion] : null;
    const out = [];
    for (const col of this.colliders.values()) {
      if (!col.ready || skip.has(col.id)) continue;
      if (motions && !motions.includes(col.motion)) continue;
      if (kinds && !kinds.includes(col.shape.kind)) continue;
      if ((col.groups & mask) === 0) continue;
      if (self && (self.groups & col.mask) === 0) continue;
      out.push(col);
    }
    return out;
  }
  /** 查询可做 BVH 射线 / shapecast 的网格。 */
  queryMeshes(filter, options) {
    const meshes = [];
    for (const col of this.query(filter, options)) {
      if (col.shape.kind === "mesh") meshes.push(col.shape.mesh);
    }
    return meshes;
  }
  /** 按运动类型列出 id（供 clearColliders）。 */
  idsByMotion(motion) {
    const out = [];
    for (const col of this.colliders.values()) {
      if (motion && col.motion !== motion) continue;
      out.push(col.id);
    }
    return out;
  }
  /** 清空全部登记。 */
  clear() {
    this.colliders.clear();
  }
};

// src/systems/CharacterMovement.ts
import * as THREE24 from "three";
var GROUND_SENSOR_RADIUS_RATIO = 0.4;
var GROUND_SUPPORT_NORMAL_Y = 0.5;
var CharacterMovement = class {
  constructor(ctrl, debug) {
    this.ctrl = ctrl;
    this.debug = debug;
    this.dynamicSupportBody = null;
    this.dynamicSupportPrevPosition = new THREE24.Vector3();
    this.dynamicSupportPrevQuaternion = new THREE24.Quaternion();
    this.dynamicSupportInvQuaternion = new THREE24.Quaternion();
    this.dynamicSupportLocal = new THREE24.Vector3();
    this.dynamicSupportBefore = new THREE24.Vector3();
    this.dynamicSupportDelta = new THREE24.Vector3();
    this.groundProbeTemps = createGroundProbeTemps();
    this.groundProbeStart = new THREE24.Vector3();
    this.groundProbeDown = new THREE24.Vector3();
    this.groundProbeOffset = new THREE24.Vector3();
    this.shapeGroundPoint = new THREE24.Vector3();
    this.shapeGroundNormal = new THREE24.Vector3();
    this.rayGroundNormal = new THREE24.Vector3();
    this.rayGroundNormalMatrix = new THREE24.Matrix3();
  }
  /** 步行 / 飞行一帧：输入速度 → 落地 → 分步碰撞 → 朝向与相机。 */
  update(delta) {
    const c = this.ctrl;
    if (c.controllerMode === 1) {
      c.clearGroundSupport();
      this.debug.clearGroundProbe();
      c.runAnimationPass(delta);
      return;
    }
    c.camera.getWorldDirection(c.camDir);
    const angle = 2 * Math.PI - (Math.atan2(c.camDir.z, c.camDir.x) + Math.PI / 2);
    const moveAxes = c.input.getMoveAxes();
    c.moveDir.copy(c.DIR_RGT).multiplyScalar(moveAxes.x).addScaledVector(c.DIR_FWD, moveAxes.y);
    if (c.isFlying) {
      if (c.input.fwd || moveAxes.isAnalog) c.moveDir.copy(c.camDir);
      if (c.input.space) c.moveDir.y += 1;
      c.curPlayerSpeed = c.input.shift ? c.playerFlySpeed * 2 : c.playerFlySpeed;
    } else {
      c.curPlayerSpeed = c.input.shift ? c.playerRunSpeed : c.playerSpeed;
    }
    c.moveDir.normalize();
    if (!c.isFlying || !moveAxes.isAnalog && !c.input.fwd) {
      c.moveDir.applyAxisAngle(c.upVector, angle);
    }
    const accelStep = c.playerAcceleration * c.decelBase * delta;
    const decelStep = c.playerDeceleration * c.decelBase * delta;
    const targetX = c.moveDir.x * c.curPlayerSpeed;
    const targetZ = c.moveDir.z * c.curPlayerSpeed;
    const diffX = targetX - c.playerVelocity.x;
    const diffZ = targetZ - c.playerVelocity.z;
    const hasXZInput = c.moveDir.x !== 0 || c.moveDir.z !== 0;
    const xzDiffLen = Math.hypot(diffX, diffZ);
    if (xzDiffLen > 0) {
      const xzApplied = Math.min(xzDiffLen, hasXZInput ? accelStep : decelStep);
      c.playerVelocity.x += diffX / xzDiffLen * xzApplied;
      c.playerVelocity.z += diffZ / xzDiffLen * xzApplied;
    }
    if (c.isFlying) {
      const targetY = c.moveDir.y * c.curPlayerSpeed;
      const diffY = targetY - c.playerVelocity.y;
      c.playerVelocity.y += Math.sign(diffY) * Math.min(Math.abs(diffY), c.moveDir.y !== 0 ? accelStep : decelStep);
    }
    c.playerCapsule.updateMatrixWorld(true);
    c.groundRaycaster.ray.origin.copy(c.playerCapsule.position);
    let bestHit;
    let hitEntry = null;
    for (const col of c.collisionWorld.query({ mask: CHARACTER_QUERY_MASK })) {
      if (col.shape.kind !== "mesh") continue;
      const hits = c.groundRaycaster.intersectObject(col.shape.mesh, false);
      if (hits.length > 0 && (!bestHit || hits[0].point.y > bestHit.point.y)) {
        bestHit = hits[0];
        hitEntry = col.motion === "kinematic" ? col.userData : null;
      }
    }
    let dynamicHit = c.dynamics.raycastGround(c.playerCapsule.position);
    if (dynamicHit && bestHit && dynamicHit.point.y <= bestHit.point.y) dynamicHit = null;
    if (dynamicHit) {
      bestHit = void 0;
      hitEntry = null;
    }
    let groundPoint = dynamicHit?.point ?? bestHit?.point;
    let usedShapeGround = false;
    const rayGroundDistance = groundPoint ? c.playerCapsule.position.y - groundPoint.y : Infinity;
    const groundCapsuleInfo = c.playerCapsule.capsuleInfo;
    this.groundProbeStart.copy(groundCapsuleInfo.segment.end).applyMatrix4(c.playerCapsule.matrixWorld);
    this.groundProbeDown.copy(c.upVector).negate();
    const lowerCenterOffset = this.groundProbeOffset.subVectors(c.playerCapsule.position, this.groundProbeStart).dot(c.upVector);
    const maxProbeDistance = Math.max(0, c.maxH - lowerCenterOffset);
    const sensorRadius = groundCapsuleInfo.radius * GROUND_SENSOR_RADIUS_RATIO;
    const useShapeProbe = rayGroundDistance > c.maxH;
    if (useShapeProbe) {
      let shapeDistance = Infinity;
      let shapeEntry = null;
      let shapeDynamicHit = null;
      for (const col of c.collisionWorld.query({ mask: CHARACTER_QUERY_MASK })) {
        if (col.shape.kind !== "mesh") continue;
        const hit = probeMeshGround(
          this.groundProbeStart,
          this.groundProbeDown,
          maxProbeDistance,
          sensorRadius,
          GROUND_SUPPORT_NORMAL_Y,
          col.shape.mesh,
          this.groundProbeTemps
        );
        if (!hit || hit.distance >= shapeDistance) continue;
        shapeDistance = hit.distance;
        this.shapeGroundPoint.copy(hit.point);
        this.shapeGroundNormal.copy(hit.normal);
        shapeEntry = col.motion === "kinematic" ? col.userData : null;
        shapeDynamicHit = null;
      }
      const dynamicVolumeHit = c.dynamics.probeGroundVolume(
        this.groundProbeStart,
        this.groundProbeDown,
        maxProbeDistance,
        sensorRadius,
        GROUND_SUPPORT_NORMAL_Y
      );
      if (dynamicVolumeHit) {
        const dynamicDistance = this.groundProbeOffset.subVectors(dynamicVolumeHit.point, this.groundProbeStart).dot(this.groundProbeDown);
        if (dynamicDistance < shapeDistance) {
          shapeDistance = dynamicDistance;
          this.shapeGroundPoint.copy(dynamicVolumeHit.point);
          this.shapeGroundNormal.copy(dynamicVolumeHit.normal);
          shapeEntry = null;
          shapeDynamicHit = dynamicVolumeHit;
        }
      }
      if (Number.isFinite(shapeDistance)) {
        groundPoint = this.shapeGroundPoint;
        bestHit = void 0;
        dynamicHit = shapeDynamicHit;
        hitEntry = shapeEntry;
        usedShapeGround = true;
      }
    }
    const capsuleScale = c.playerCapsule.scale;
    const sy = capsuleScale.y || 1;
    const sxz = Math.max(1e-6, Math.min(capsuleScale.x || 1, capsuleScale.z || 1));
    this.debug.updateGroundSensor(
      this.groundProbeStart,
      this.groundProbeDown,
      maxProbeDistance / sy,
      sensorRadius / sxz,
      useShapeProbe,
      usedShapeGround
    );
    this.debug.updateGroundProbe(
      c.groundRaycaster.ray.origin,
      groundPoint ?? null,
      c.maxH,
      c.groundRaycaster.near
    );
    if (!c.isFlying) {
      if (groundPoint) {
        const snapY = groundPoint.y + c.snapH;
        const dist = c.playerCapsule.position.y - groundPoint.y;
        if (dist > c.maxH) {
          c.applyGravity(delta);
        } else if (c.playerVelocity.y <= 0) {
          if (c.playerIsOnGround) {
            c.snapToGround(
              snapY,
              usedShapeGround ? this.shapeGroundNormal.y >= c.minFloorNormalY : dynamicHit ? dynamicHit.normal.y >= c.minFloorNormalY : c.isFlatFloor(bestHit),
              delta
            );
          } else {
            const predictedY = c.playerCapsule.position.y + c.playerVelocity.y * delta;
            if (predictedY <= snapY) c.snapToGround(snapY);
            else c.applyGravity(delta);
          }
        } else {
          c.applyGravity(delta);
        }
      } else {
        c.applyGravity(delta);
      }
      c.playerCapsule.position.y += c.playerVelocity.y * delta;
    }
    c.activeDynamicBody = c.playerIsOnGround ? dynamicHit?.body ?? null : null;
    c.activeKinematicCollider = c.playerIsOnGround && !c.activeDynamicBody ? hitEntry : null;
    this.setDynamicSupport(c.activeDynamicBody);
    const capsuleInfo = c.playerCapsule.capsuleInfo;
    const xzSpeed = Math.hypot(c.playerVelocity.x, c.playerVelocity.z);
    const totalDist = c.isFlying ? c.playerVelocity.length() * delta : xzSpeed * delta;
    c.xzDir.set(c.playerVelocity.x, c.isFlying ? c.playerVelocity.y : 0, c.playerVelocity.z).normalize();
    const maxStep = capsuleInfo.radius * 0.8;
    const steps = Math.min(Math.max(1, Math.ceil(totalDist / maxStep)), c.maxMoveSteps);
    const stepDist = totalDist / steps;
    const blockedEpsSq = (maxStep * 0.05) ** 2;
    for (let i = 0; i < steps; i++) {
      c.moveStepOrigin.copy(c.playerCapsule.position);
      c.playerCapsule.position.addScaledVector(c.xzDir, stepDist);
      c.playerCapsule.updateMatrixWorld();
      if (!c.skipCapsuleCollision) {
        const kinMeshes = c.getKinematicColliderEntries();
        for (const mesh of c.getColliderMeshes()) {
          c.playerCapsule.updateMatrixWorld();
          const isKin = kinMeshes.some((e) => e.mesh === mesh);
          applyCapsuleCollision(
            c.playerCapsule,
            capsuleInfo,
            mesh,
            isKin ? c.kinematicTemps : c.staticTemps,
            void 0,
            c.isFlying
          );
        }
        c.dynamics.collideWithCapsule();
        if (c.playerCapsule.position.distanceToSquared(c.moveStepOrigin) < blockedEpsSq) {
          break;
        }
      }
    }
    if (c.activeKinematicCollider && c.playerIsOnGround && !c.isFlying) {
      c.playerCapsule.position.add(c.activeKinematicCollider.deltaPos);
      if (c.activeKinematicCollider.deltaRotY !== 0) {
        c.playerCapsule.rotateY(c.activeKinematicCollider.deltaRotY);
      }
    }
    this.updateGroundSupport(groundPoint, bestHit, dynamicHit, usedShapeGround);
    c.playerCapsule.updateMatrixWorld(true);
    this.debug.refreshTransforms();
    if (!c.isFirstPerson) {
      const camDirFlat = c.camDir.clone().setY(0).normalize().negate();
      const moveDirFlat = c.moveDir.clone().normalize().negate();
      if (!c.isFlying) {
        if (c.cam.mouseMode === 4 || c.cam.mouseMode === 5) {
          c.targetMat.lookAt(c.playerCapsule.position, c.playerCapsule.position.clone().add(camDirFlat), c.playerCapsule.up);
          c.playerCapsule.quaternion.copy(c.targetQuat.setFromRotationMatrix(c.targetMat));
        } else if (c.cam.mouseMode === 0 || c.cam.mouseMode === 2) {
          const lookTarget = c.playerCapsule.position.clone().add(moveDirFlat.lengthSq() > 0 ? moveDirFlat : camDirFlat);
          c.targetMat.lookAt(c.playerCapsule.position, lookTarget, c.playerCapsule.up);
          c.playerCapsule.quaternion.slerp(c.targetQuat.setFromRotationMatrix(c.targetMat), Math.min(1, c.rotationSpeed * delta));
        } else if (moveDirFlat.lengthSq() > 0) {
          c.targetMat.lookAt(c.playerCapsule.position, c.playerCapsule.position.clone().add(moveDirFlat), c.playerCapsule.up);
          c.playerCapsule.quaternion.slerp(c.targetQuat.setFromRotationMatrix(c.targetMat), Math.min(1, c.rotationSpeed * delta));
        }
      } else {
        const lookTarget = c.playerCapsule.position.clone().add(c.input.fwd ? moveDirFlat : camDirFlat);
        c.targetMat.lookAt(c.playerCapsule.position, lookTarget, c.playerCapsule.up);
        c.playerCapsule.quaternion.slerp(c.targetQuat.setFromRotationMatrix(c.targetMat), Math.min(1, c.rotationSpeed * delta));
      }
    }
    if (!c.isFirstPerson) {
      const lookTarget = c.cam.springTarget(c.cam.getLookAtPoint(), delta);
      c.camera.position.sub(c.controls.target);
      c.camera.position.add(lookTarget);
      c.controls.target.copy(lookTarget);
      c.controls.update();
      c.cam.applyFlySprintMaxDist();
      c.cam.updateWithRaycast(c.controls.target);
    }
    if (c.isShowMobileControls && c.vehicle.list.length) {
      let near = false;
      for (const veh of c.vehicle.list) {
        if (c.vehicle.isInBoardingRange(veh, c.playerCapsule.position)) {
          near = true;
          break;
        }
      }
      if (near !== c.isNearVehicle) {
        c.isNearVehicle = near;
        c.mobileControls?.syncVehicleBtn(near);
      }
    }
    c.animation.setAnimationByPressed();
    c.runAnimationPass(delta);
  }
  /** 将射线或体积探测最终采用的支撑点统一转换成世界空间结果。 */
  updateGroundSupport(point, meshHit, dynamicHit, usedShapeGround) {
    const c = this.ctrl;
    if (c.isFlying || !c.playerIsOnGround || !point) {
      c.clearGroundSupport();
      return;
    }
    if (usedShapeGround) {
      this.rayGroundNormal.copy(this.shapeGroundNormal);
    } else if (dynamicHit) {
      this.rayGroundNormal.copy(dynamicHit.normal);
    } else if (meshHit?.face) {
      this.rayGroundNormal.copy(meshHit.face.normal).applyMatrix3(this.rayGroundNormalMatrix.getNormalMatrix(meshHit.object.matrixWorld)).normalize();
    } else {
      this.rayGroundNormal.copy(c.upVector);
    }
    c.setGroundSupport(point, this.rayGroundNormal);
  }
  /** 切换当前动态支撑体并记录位姿。 */
  setDynamicSupport(body) {
    if (this.dynamicSupportBody === body) return;
    this.dynamicSupportBody = body;
    if (!body) return;
    this.dynamicSupportPrevPosition.copy(body.position);
    this.dynamicSupportPrevQuaternion.copy(body.quaternion);
  }
  /** 动态支撑体推进后按前后位姿带走人物。 */
  applyDynamicSupportCarry() {
    const c = this.ctrl;
    const body = c.activeDynamicBody;
    if (body !== this.dynamicSupportBody) this.setDynamicSupport(body);
    if (!body) return;
    if (!c.dynamics.list.includes(body)) {
      c.activeDynamicBody = null;
      this.setDynamicSupport(null);
      return;
    }
    if (c.controllerMode === 1 || c.isFlying || !c.playerIsOnGround) {
      this.dynamicSupportPrevPosition.copy(body.position);
      this.dynamicSupportPrevQuaternion.copy(body.quaternion);
      return;
    }
    this.dynamicSupportBefore.copy(c.playerCapsule.position);
    this.dynamicSupportInvQuaternion.copy(this.dynamicSupportPrevQuaternion).invert();
    this.dynamicSupportLocal.subVectors(
      c.playerCapsule.position,
      this.dynamicSupportPrevPosition
    ).applyQuaternion(this.dynamicSupportInvQuaternion);
    c.playerCapsule.position.copy(this.dynamicSupportLocal).applyQuaternion(body.quaternion).add(body.position);
    c.playerCapsule.updateMatrixWorld();
    this.dynamicSupportDelta.subVectors(c.playerCapsule.position, this.dynamicSupportBefore);
    if (!c.isFirstPerson && this.dynamicSupportDelta.lengthSq() > 0) {
      c.camera.position.add(this.dynamicSupportDelta);
      c.controls.target.add(this.dynamicSupportDelta);
    }
    this.dynamicSupportPrevPosition.copy(body.position);
    this.dynamicSupportPrevQuaternion.copy(body.quaternion);
  }
};

// src/systems/PlayerDebug.ts
import * as THREE25 from "three";
var HIT_COLOR = 6750054;
var FAR_HIT_COLOR = 16763955;
var MISS_COLOR = 16733525;
var SENSOR_IDLE_COLOR = 4577279;
var PlayerDebug = class {
  constructor(ctrl) {
    this.ctrl = ctrl;
    this.visible = false;
    this.hasGroundProbe = false;
    this.groundProbeHasHit = false;
    this.groundProbeMaxDistance = 0;
    this.groundProbeNear = 0;
    this.groundRay = null;
    this.groundHit = null;
    this.groundProbePoint = new THREE25.Vector3();
    this.hasGroundSensor = false;
    this.groundSensorActive = false;
    this.groundSensorHasHit = false;
    this.groundSensorMaxDistance = 0;
    this.groundSensorRadius = 0;
    this.groundSensor = null;
    this.probeLocalPoint = new THREE25.Vector3();
    this.capsuleLocalDown = new THREE25.Vector3(0, -1, 0);
    this.debugRoot = null;
  }
  /** 返回人物调试开关。 */
  isVisible() {
    return this.visible;
  }
  /** 切换人物胶囊与地面探测调试。 */
  setVisible(visible) {
    this.visible = visible;
    this.syncVisibility();
  }
  /** 在玩家模型或控制模式变化后重新同步显隐。 */
  syncVisibility() {
    const capsule = this.ctrl.playerCapsule;
    if (capsule) {
      const materials = Array.isArray(capsule.material) ? capsule.material : [capsule.material];
      for (const material of materials) material.visible = this.visible;
    }
    const showProbe = this.visible && this.hasGroundProbe && this.ctrl.controllerMode === 0;
    const showSensor = this.visible && this.hasGroundSensor && this.ctrl.controllerMode === 0;
    if (this.groundRay) this.groundRay.visible = showProbe;
    if (this.groundHit) this.groundHit.visible = showProbe && this.groundProbeHasHit;
    if (this.groundSensor) this.groundSensor.visible = showSensor;
    if (showProbe) this.renderGroundProbe();
    if (showSensor) this.renderGroundSensor();
  }
  /**
   * 移动结束后刷新调试体姿态，使射线/体积传感区跟随胶囊实时位置。
   */
  refreshTransforms() {
    if (!this.visible || this.ctrl.controllerMode !== 0) return;
    if (this.hasGroundProbe) this.renderGroundProbe();
    if (this.hasGroundSensor) this.renderGroundSensor();
  }
  /** 写入移动系统本帧实际使用的中心地面探测结果。 */
  updateGroundProbe(origin, hitPoint, maxDistance, near = 0) {
    this.hasGroundProbe = true;
    this.groundProbeHasHit = hitPoint !== null;
    this.groundProbeMaxDistance = Math.max(0, maxDistance);
    this.groundProbeNear = Math.max(0, near);
    if (hitPoint) this.groundProbePoint.copy(hitPoint);
    else this.groundProbePoint.copy(origin).y -= this.groundProbeMaxDistance;
  }
  /** 写入胶囊下方体积地面传感区的当前状态。 */
  updateGroundSensor(_start, _down, maxDistance, radius, active, hasHit) {
    this.hasGroundSensor = maxDistance > 0 && radius > 0;
    this.groundSensorActive = active;
    this.groundSensorHasHit = hasHit;
    this.groundSensorMaxDistance = Math.max(0, maxDistance);
    this.groundSensorRadius = Math.max(0, radius);
  }
  /** 清除当前地面探测显示。 */
  clearGroundProbe() {
    this.hasGroundProbe = false;
    this.hasGroundSensor = false;
    if (this.groundRay) this.groundRay.visible = false;
    if (this.groundHit) this.groundHit.visible = false;
    if (this.groundSensor) this.groundSensor.visible = false;
  }
  /** 释放人物调试几何与材质。 */
  dispose() {
    if (this.debugRoot) {
      this.debugRoot.removeFromParent();
      this.debugRoot.traverse((obj) => {
        const mesh = obj;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      this.debugRoot = null;
    }
    this.groundRay = null;
    this.groundHit = null;
    this.groundSensor = null;
    this.hasGroundProbe = false;
    this.hasGroundSensor = false;
  }
  ensureDebugRoot() {
    const capsule = this.ctrl.playerCapsule;
    if (!capsule) return null;
    if (!this.debugRoot) {
      this.debugRoot = new THREE25.Group();
      this.debugRoot.name = "playerDebugRoot";
      capsule.add(this.debugRoot);
    } else if (this.debugRoot.parent !== capsule) {
      capsule.add(this.debugRoot);
    }
    return this.debugRoot;
  }
  /** 按当前探测结果更新线段、命中点和颜色。 */
  renderGroundProbe() {
    const capsule = this.ctrl.playerCapsule;
    const root = this.ensureDebugRoot();
    if (!capsule || !root) return;
    this.ensureGroundProbeObjects(root);
    if (!this.groundRay || !this.groundHit) return;
    this.worldToCapsuleLocal(this.groundProbePoint, this.probeLocalPoint);
    const positions = this.groundRay.geometry.getAttribute("position");
    positions.setXYZ(0, 0, 0, 0);
    positions.setXYZ(1, this.probeLocalPoint.x, this.probeLocalPoint.y, this.probeLocalPoint.z);
    positions.needsUpdate = true;
    const distance = capsule.position.y - this.groundProbePoint.y;
    const hitInRange = this.groundProbeHasHit && distance >= this.groundProbeNear && distance <= this.groundProbeMaxDistance;
    const color = hitInRange ? HIT_COLOR : this.groundProbeHasHit ? FAR_HIT_COLOR : MISS_COLOR;
    this.groundRay.material.color.setHex(color);
    this.groundRay.visible = true;
    this.groundHit.visible = this.groundProbeHasHit;
    if (this.groundProbeHasHit) {
      this.groundHit.position.copy(this.probeLocalPoint);
      const sy = Math.max(1e-6, capsule.scale.y || 1);
      const localRadius = (capsule.capsuleInfo?.radius ?? 0) / sy;
      this.groundHit.scale.setScalar(Math.max(1e-6, localRadius * 0.05));
      this.groundHit.material.color.setHex(color);
    }
  }
  /** 按当前状态更新体积地面传感区（锚定在胶囊 segment.end）。 */
  renderGroundSensor() {
    const capsule = this.ctrl.playerCapsule;
    const root = this.ensureDebugRoot();
    const segEnd = capsule?.capsuleInfo?.segment.end;
    if (!capsule || !root || !segEnd) return;
    this.ensureGroundSensorObject(root);
    if (!this.groundSensor) return;
    const distance = Math.max(this.groundSensorMaxDistance, 1e-6);
    this.groundSensor.position.copy(segEnd).addScaledVector(this.capsuleLocalDown, distance * 0.5);
    this.groundSensor.quaternion.identity();
    this.groundSensor.scale.set(this.groundSensorRadius, distance, this.groundSensorRadius);
    const material = this.groundSensor.material;
    material.color.setHex(
      this.groundSensorActive ? this.groundSensorHasHit ? HIT_COLOR : MISS_COLOR : SENSOR_IDLE_COLOR
    );
    material.opacity = this.groundSensorActive ? 0.75 : 0.4;
    this.groundSensor.visible = this.hasGroundSensor;
  }
  worldToCapsuleLocal(world, target) {
    target.copy(world);
    this.ctrl.playerCapsule.worldToLocal(target);
    return target;
  }
  /** 延迟创建地面射线和命中标记。 */
  ensureGroundProbeObjects(root) {
    if (!this.groundRay) {
      this.groundRay = new THREE25.Line(
        new THREE25.BufferGeometry().setFromPoints([new THREE25.Vector3(), new THREE25.Vector3()]),
        new THREE25.LineBasicMaterial({
          color: MISS_COLOR,
          depthTest: true,
          transparent: true,
          opacity: 0.9
        })
      );
      this.groundRay.name = "playerGroundRayDebug";
      this.groundRay.renderOrder = 30;
      this.groundRay.frustumCulled = false;
      root.add(this.groundRay);
    } else if (this.groundRay.parent !== root) {
      root.add(this.groundRay);
    }
    if (!this.groundHit) {
      this.groundHit = new THREE25.Mesh(
        new THREE25.SphereGeometry(2, 10, 8),
        new THREE25.MeshBasicMaterial({
          color: HIT_COLOR,
          wireframe: true,
          depthTest: true,
          transparent: true,
          opacity: 0.9
        })
      );
      this.groundHit.name = "playerGroundRayHitDebug";
      this.groundHit.renderOrder = 31;
      this.groundHit.frustumCulled = false;
      root.add(this.groundHit);
    } else if (this.groundHit.parent !== root) {
      root.add(this.groundHit);
    }
  }
  /** 延迟创建体积地面传感区线框。 */
  ensureGroundSensorObject(root) {
    if (this.groundSensor) {
      if (this.groundSensor.parent !== root) root.add(this.groundSensor);
      return;
    }
    this.groundSensor = new THREE25.Mesh(
      new THREE25.CylinderGeometry(1, 1, 1, 16, 1, true),
      new THREE25.MeshBasicMaterial({
        color: SENSOR_IDLE_COLOR,
        wireframe: true,
        depthTest: true,
        depthWrite: true,
        transparent: true,
        opacity: 0.4,
        side: THREE25.DoubleSide
      })
    );
    this.groundSensor.name = "playerGroundVolumeDebug";
    this.groundSensor.renderOrder = 29;
    this.groundSensor.frustumCulled = false;
    root.add(this.groundSensor);
  }
};

// src/PlayerController.ts
var _lastUpdateTime = performance.now();
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
var playerController = class {
  constructor() {
    // ==================== 场景引用 ====================
    /** GLTF加载器缓存。 */
    this._loader = null;
    /** 初始出生位置。 */
    this.initPos = new THREE26.Vector3(0, 0, 0);
    /** 重力加速度。 */
    this.gravity = -2400;
    /** 跳跃初速度。 */
    this.jumpHeight = 600;
    /** 行走速度。 */
    this.playerSpeed = 200;
    /** 跑步速度。 */
    this.playerRunSpeed = 600;
    /** 飞行速度。 */
    this.playerFlySpeed = 2100;
    /** 当前实际速度。 */
    this.curPlayerSpeed = 0;
    /** 越肩视角开关。 */
    this.enableOverShoulderView = false;
    /** 显示移动端控件。 */
    this.isShowMobileControls = true;
    // ==================== 玩家胶囊体 ====================
    /** 胶囊体半径。 */
    this.playerCapsuleRadius = 30;
    /** 半径缩放比。 */
    this.playerCapsuleRadiusRatio = 1;
    /** 胶囊体高度。 */
    this.playerCapsuleHeight = 180;
    /** 第一人称状态。 */
    this.isFirstPerson = false;
    // ==================== 运行状态 ====================
    /** 0步行 1载具。 */
    this.controllerMode = 0;
    /** 是否在地面。 */
    this.playerIsOnGround = false;
    /** 帧更新开关。 */
    this.isupdate = true;
    /** 时间缩放系数。 */
    this.timeScale = 1;
    /** 本帧实际使用的 delta（已钳制 + timeScale）。 */
    this.currentDelta = 0;
    /** 飞行状态。 */
    this.isFlying = false;
    /** 临时跳过玩家胶囊碰撞检测。 */
    this.skipCapsuleCollision = false;
    /** 启用朝向输入。 */
    this.enableToward = true;
    /** 模型根节点。 */
    this.playerModel = null;
    /** 头骨节点。 */
    this.playerModelHead = null;
    // ==================== 碰撞体 ====================
    /** 碰撞体注册表。 */
    this.collisionWorld = new CollisionWorld();
    /** 统一创建 / 运动学跟随。 */
    this.colliders = new ColliderRegistry(this);
    /** 人物胶囊与地面探测调试。 */
    this.playerDebug = new PlayerDebug(this);
    /** 人物移动（胶囊推出）。 */
    this.character = new CharacterMovement(this, this.playerDebug);
    /** 当前站立的运动学碰撞体。 */
    this.activeKinematicCollider = null;
    /** 当前站立的动态刚体。 */
    this.activeDynamicBody = null;
    /** 移动系统本帧最终采用的地面支撑；供 IK 等插件与角色接地逻辑保持一致。 */
    this.hasGroundSupport = false;
    this.groundSupportHit = {
      point: new THREE26.Vector3(),
      normal: new THREE26.Vector3(0, 1, 0)
    };
    /** 异步 BVH 构建队列。 */
    this.bvhWorkerPool = new BvhWorkerPool();
    // ==================== 碰撞阈值 ====================
    /** 悬空胶囊离地高度。 */
    this.rideHeight = 40;
    // 站立 / 落地阈值
    /** 站立时胶囊原点应离地的高度。 */
    this.snapH = 0;
    /** 离地超过此值判为悬空、施加重力。 */
    this.maxH = 0;
    // ==================== 台阶视觉平滑 ====================
    /** 插值追赶速度，越大追得越快。 */
    this.stepSmoothFactor = 10;
    /** 模型相对胶囊的基准 Y。 */
    this.modelBaseY = 0;
    /** 最小法线 Y 分量，地面法线与竖直夹角 ≤ 8° 视为台阶/平地（注入平滑）。 */
    this.minFloorNormalY = Math.cos(8 * Math.PI / 180);
    // ==================== 移动端 ====================
    /** 移动端控件。 */
    this.mobileControls = null;
    /** 靠近车辆。 */
    this.isNearVehicle = false;
    // ==================== 方向常量 & 复用向量 ====================
    /** 朝向旋转速度。 */
    this.rotationSpeed = 10;
    /** 世界上方向。 */
    this.upVector = new THREE26.Vector3(0, 1, 0);
    /** 前。 */
    this.DIR_FWD = new THREE26.Vector3(0, 0, -1);
    /** 右。 */
    this.DIR_RGT = new THREE26.Vector3(1, 0, 0);
    /** XZ 加速响应速度。 */
    this.playerAcceleration = 30;
    /** XZ 减速响应速度。 */
    this.playerDeceleration = 30;
    /** 减速基准速度。 */
    this.decelBase = 300;
    /** 玩家速度。 */
    this.playerVelocity = new THREE26.Vector3();
    /** 相机方向缓存。 */
    this.camDir = new THREE26.Vector3();
    /** 移动方向缓存。 */
    this.moveDir = new THREE26.Vector3();
    /** 步进方向缓存。 */
    this.xzDir = new THREE26.Vector3();
    /** 本步移动前的胶囊位置。 */
    this.moveStepOrigin = new THREE26.Vector3();
    /** 单帧胶囊碰撞子步上限。 */
    this.maxMoveSteps = 8;
    /** 目标四元数。 */
    this.targetQuat = new THREE26.Quaternion();
    /** 目标变换矩阵。 */
    this.targetMat = new THREE26.Matrix4();
    /** 静态碰撞临时对象。 */
    this.staticTemps = createCollisionTemps();
    /** 运动学碰撞临时对象。 */
    this.kinematicTemps = createCollisionTemps();
    /** 地面检测射线。 */
    this.groundRaycaster = new THREE26.Raycaster(new THREE26.Vector3(), new THREE26.Vector3(0, -1, 0));
    // ==================== 插件 ====================
    /** 后处理等可选插件。 */
    this.plugins = [];
    // ==================== 子系统 ====================
    /** 动画系统。 */
    this.animation = new AnimationSystem(this);
    /** 相机系统。 */
    this.cam = new CameraSystem(this);
    /** 输入系统。 */
    this.input = new InputSystem(this);
    /** 载具系统。 */
    this.vehicle = new VehicleSystem(this);
    /** 动态刚体系统。 */
    this.dynamics = new DynamicBodySystem(this);
    this.groundRaycaster.firstHitOnly = true;
  }
  /** GLTF加载器。 */
  get loader() {
    return this.initLoader();
  }
  set loader(loader) {
    this._loader = loader;
  }
  // ==================== 初始化 ====================
  /** 主初始化入口。 */
  async init(opts, callback) {
    const m = opts.playerModelConfig;
    const s = m.scale ?? 1;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.camera.rotation.order = "YXZ";
    this.controls = opts.controls;
    this.playerModelConfig = m;
    this.initPos = opts.initPos ? opts.initPos.clone() : this.initPos;
    const pm = this.playerModelConfig;
    this.gravity = (pm.gravity ?? this.gravity) * s;
    this.jumpHeight = (pm.jumpHeight ?? this.jumpHeight) * s;
    this.playerSpeed = (pm.speed ?? this.playerSpeed) * s;
    this.playerRunSpeed = (pm.runSpeed ?? this.playerRunSpeed) * s;
    this.playerFlySpeed = (pm.flySpeed ?? this.playerFlySpeed) * s;
    this.curPlayerSpeed = this.playerSpeed;
    this.playerCapsuleRadiusRatio = pm.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
    this.playerAcceleration = pm.acceleration ?? this.playerAcceleration;
    this.playerDeceleration = pm.deceleration ?? this.playerDeceleration;
    this.decelBase = this.playerSpeed;
    this.cam.sensitivity = opts.mouseSensitivity ?? this.cam.sensitivity;
    this.cam.mouseMode = opts.thirdMouseMode ?? this.cam.mouseMode;
    this.cam.enableSpringCamera = opts.enableSpringCamera ?? this.cam.enableSpringCamera;
    this.cam.springCameraTime = opts.springCameraTime ?? this.cam.springCameraTime;
    this.cam.zoomEnabled = opts.enableZoom ?? this.cam.zoomEnabled;
    this.cam.minDist = (opts.minCamDistance ?? this.cam.minDist) * s;
    this.cam.maxDist = (opts.maxCamDistance ?? this.cam.maxDist) * s;
    this.cam.lookAtHeightRatio = opts.camLookAtHeightRatio ?? this.cam.lookAtHeightRatio;
    this.cam.overShoulderOffsetRatio = opts.camOverShoulderOffsetRatio ?? this.cam.overShoulderOffsetRatio;
    this.cam.originMaxDist = this.cam.maxDist;
    this.cam.epsilon = this.cam.epsilon * s;
    this.isShowMobileControls = (opts.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();
    this.enableOverShoulderView = opts.enableOverShoulderView ?? this.enableOverShoulderView;
    this.isFirstPerson = opts.isFirstPerson ?? this.isFirstPerson;
    this.timeScale = opts.timeScale ?? this.timeScale;
    if (opts.keyMap) this.input.buildKeyMap(opts.keyMap);
    if (this.isShowMobileControls) {
      this.mobileControls = new MobileControls((i) => this.input.setInput(i), this.controls);
      await this.mobileControls.init(opts.mobileControls);
    }
    if (opts.colliders?.length) {
      for (const desc of opts.colliders) this.addCollider(desc);
    }
    await this.loadPlayerModel();
    this.input.bindEvents();
    this.cam.setCamPos();
    this.cam.initControls();
    this.cam.setOverShoulder(this.isFirstPerson ? false : this.enableOverShoulderView);
    callback?.();
  }
  /** 初始化加载器。 */
  initLoader() {
    if (this._loader) return this._loader;
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.186.0/examples/jsm/libs/draco/gltf/");
    loader.setDRACOLoader(dracoLoader);
    this._loader = loader;
    return loader;
  }
  // ==================== 玩家模型 ====================
  /** 加载模型与动画。 */
  async loadPlayerModel() {
    try {
      const config = this.playerModelConfig;
      let model;
      let animations;
      if (config.model) {
        model = config.model;
        animations = config.animations;
      } else {
        const gltf = await this.loader.loadAsync(config.url);
        model = gltf.scene;
        animations = gltf.animations ?? [];
      }
      this.playerModel = model;
      this.animation.mixer = new THREE26.AnimationMixer(this.playerModel);
      this.animation.clips = animations;
      this.animation.actions = /* @__PURE__ */ new Map();
      const mc = this.playerModelConfig;
      const isThreePartJump = Array.isArray(mc.jumpAnim);
      this.animation.hasThreePartJump = isThreePartJump;
      const mappings = [
        [mc.idleAnim, "idle"],
        [mc.walkAnim, "walking"],
        [mc.leftWalkAnim || mc.walkAnim, "left_walking"],
        [mc.rightWalkAnim || mc.walkAnim, "right_walking"],
        [mc.backwardAnim || mc.walkAnim, "walking_backward"],
        ...typeof mc.jumpAnim === "string" ? [[mc.jumpAnim, "jumping"]] : [],
        [mc.runAnim, "running"],
        [mc.flyIdleAnim || mc.idleAnim, "flyidle"],
        [mc.flyAnim || mc.idleAnim, "flying"],
        [mc.flyHoverForwardAnim || mc.flyAnim || mc.idleAnim, "flyHoverForward"],
        [mc.flyHoverBackAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverBack"],
        [mc.flyHoverLeftAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverLeft"],
        [mc.flyHoverRightAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverRight"],
        [mc.flyHoverUpAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverUp"],
        [mc.flyHoverDownAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverDown"],
        [mc.drivingAnim || mc.idleAnim, "driving"]
      ];
      for (const [clipName, actionName] of mappings) {
        const clip = animations.find((a) => a.name === clipName);
        if (!clip) continue;
        const action = this.animation.mixer.clipAction(clip);
        if (actionName === "jumping") {
          action.setLoop(THREE26.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.setEffectiveTimeScale(1.2);
        } else {
          action.setLoop(THREE26.LoopRepeat, Infinity);
          action.setEffectiveTimeScale(1);
        }
        action.enabled = true;
        action.setEffectiveWeight(0);
        this.animation.actions.set(actionName, action);
      }
      if (Array.isArray(mc.jumpAnim)) {
        const [startClip, loopClip, endClip] = mc.jumpAnim;
        const jumpDefs = [
          [startClip, "jumpStart", THREE26.LoopOnce, true],
          [loopClip, "jumpLoop", THREE26.LoopRepeat, false],
          [endClip, "jumpEnd", THREE26.LoopOnce, true]
        ];
        for (const [clipName, key, loop, clamp] of jumpDefs) {
          const clip = animations.find((a) => a.name === clipName);
          if (!clip) {
            console.warn(`\u627E\u4E0D\u5230\u8DF3\u8DC3\u52A8\u753B clip: "${clipName}"`);
            continue;
          }
          const action = this.animation.mixer.clipAction(clip);
          action.setLoop(loop, loop === THREE26.LoopOnce ? 1 : Infinity);
          action.clampWhenFinished = clamp;
          action.setEffectiveTimeScale(key === "jumpStart" ? 1.2 : 1);
          action.enabled = true;
          action.setEffectiveWeight(0);
          this.animation.actions.set(key, action);
        }
      }
      const defaultSet = /* @__PURE__ */ new Map();
      for (const key of ["idle", "walking", "walking_backward", "running", "jumping", "flyidle", "flying"]) {
        const action = this.animation.actions.get(key);
        if (action) defaultSet.set(key, action);
      }
      this.animation.sets.set("default", defaultSet);
      this.animation.actions.get("idle")?.setEffectiveWeight(1);
      this.animation.actions.get("idle")?.play();
      this.animation.state = this.animation.actions.get("idle");
      this.animation.mixerCb = (ev) => {
        const done = ev.action;
        const resolveGroundAnim = () => {
          if (this.input.fwd) {
            this.animation.playByName(this.input.shift ? "running" : "walking");
            return;
          }
          if (this.input.bkd) {
            this.animation.playByName("walking_backward");
            return;
          }
          if (this.input.rgt || this.input.lft) {
            this.animation.playByName("walking");
            return;
          }
          this.animation.playByName("idle");
        };
        if (done === this.animation.actions?.get("jumping")) {
          if (this.animation.state === done) resolveGroundAnim();
          return;
        }
        if (done === this.animation.actions?.get("jumpStart")) {
          if (this.animation.state === done) this.animation.playByName("jumpLoop");
          return;
        }
        if (done === this.animation.actions?.get("jumpEnd")) {
          if (this.animation.state === done) resolveGroundAnim();
          return;
        }
      };
      this.animation.mixer.addEventListener("finished", this.animation.mixerCb);
      this.animation.mixer.update(0);
      this.playerModel.updateMatrixWorld(true);
      const { size } = getBbox(this.playerModel);
      const modelScale = this.playerCapsuleHeight / size.y;
      const s = this.playerModelConfig.scale;
      const r = this.playerCapsuleRadius * s * this.playerCapsuleRadiusRatio;
      const h = this.playerCapsuleHeight * s;
      const rideHeightScaled = this.rideHeight * s;
      const colliderHeight = h - rideHeightScaled;
      const segmentLength = colliderHeight - 2 * r;
      this.playerCapsule = new THREE26.Mesh(
        new THREE26.CapsuleGeometry(r, Math.max(segmentLength, 1e-6), 4, 8),
        new THREE26.MeshBasicMaterial({
          color: 12868863,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
          side: THREE26.DoubleSide
        })
      );
      this.playerCapsule.geometry.translate(0, -segmentLength / 2, 0);
      this.playerCapsule.capsuleInfo = {
        radius: r,
        segment: new THREE26.Line3(new THREE26.Vector3(), new THREE26.Vector3(0, -segmentLength, 0)),
        // 动态体用接到脚底的完整胶囊，避免球从悬空间隙钻过
        dynamicsSegment: new THREE26.Line3(new THREE26.Vector3(), new THREE26.Vector3(0, -segmentLength - rideHeightScaled, 0))
      };
      this.recomputeGroundThresholds();
      this.playerCapsule.name = "capsule";
      this.playerCapsule.material.visible = false;
      this.scene.add(this.playerCapsule);
      this.reset();
      this.playerCapsule.rotateY(this.playerModelConfig.rotateY ?? 0);
      this.playerModel.scale.multiplyScalar(modelScale * s);
      this.modelBaseY = -segmentLength - r - rideHeightScaled;
      this.playerModel.position.set(0, this.modelBaseY, 0);
      this.playerModel.traverse((child) => {
        if (child.name === this.playerModelConfig?.headBoneName) this.playerModelHead = child;
      });
      this.playerCapsule.add(this.playerModel);
      this.reset();
    } catch (e) {
      console.error("\u52A0\u8F7D\u73A9\u5BB6\u6A21\u578B\u5931\u8D25:", e);
    }
  }
  /** 切换玩家模型。 */
  async switchPlayerModel(newPlayerModel) {
    const savedPos = this.playerCapsule.position.clone();
    const savedQuat = this.playerCapsule.quaternion.clone();
    const wasFirstPerson = this.isFirstPerson;
    if (wasFirstPerson) this.scene.attach(this.camera);
    if (this.playerCapsule) this.scene.remove(this.playerCapsule);
    if (this.playerModel) {
      this.playerCapsule.remove(this.playerModel);
      this.playerModel = null;
      this.playerModelHead = null;
    }
    const anim = this.animation;
    if (anim.mixer) {
      if (anim.mixerCb) {
        anim.mixer.removeEventListener("finished", anim.mixerCb);
        anim.mixerCb = void 0;
      }
      anim.mixer.stopAllAction();
      anim.mixer.uncacheRoot(anim.mixer.getRoot());
      anim.mixer = void 0;
      anim.actions = void 0;
    }
    const ratio = newPlayerModel.scale / this.playerModelConfig.scale;
    this.playerModelConfig = {
      ...this.playerModelConfig,
      url: void 0,
      model: void 0,
      animations: void 0,
      ...newPlayerModel
    };
    this.applyGameplayScaleRatio(ratio);
    await this.loadPlayerModel();
    this.playerCapsule.position.copy(savedPos);
    this.playerCapsule.quaternion.copy(savedQuat);
    if (wasFirstPerson) this.cam.setFirstPerson();
    this.syncDebugVisibility();
    for (const plugin of this.plugins) plugin.onPlayerModelChange?.();
  }
  // ==================== 插件 ====================
  /** 注册后处理插件。 */
  use(plugin) {
    if (this.plugins.includes(plugin)) return this;
    if (plugin.name) {
      const existing = this.plugins.find((p) => p.name === plugin.name);
      if (existing) this.unuse(existing);
    }
    this.plugins.push(plugin);
    plugin.onAttach?.(this);
    return this;
  }
  /** 卸载已注册的插件。 */
  unuse(plugin) {
    const index = this.plugins.indexOf(plugin);
    if (index < 0) return this;
    this.plugins.splice(index, 1);
    plugin.onDetach?.();
    return this;
  }
  /** 获取当前插件列表的只读副本。 */
  getPlugins() {
    return this.plugins.slice();
  }
  // ==================== 碰撞体构建和查询 ====================
  /** @internal BVH worker。 */
  getBvhWorkerPool() {
    return this.bvhWorkerPool;
  }
  /** @internal 静态 / 运动学 mesh 线框开关。 */
  getDisplayCollider() {
    return this.colliders.getDebugVisible();
  }
  /** @internal 动态刚体线框开关。 */
  getDisplayDynamicBody() {
    return this.dynamics.getDebugVisible();
  }
  /** 统一创建碰撞体。 */
  addCollider(desc) {
    return this.colliders.add(desc);
  }
  /** 按句柄移除碰撞体。 */
  removeCollider(handle) {
    this.colliders.remove(handle);
  }
  /** 运行时等比缩放已烘焙的运动学 mesh 碰撞（不重建 BVH）。 */
  scaleKinematicColliderContent(source, ratio) {
    this.colliders.scaleKinematicContent(source, ratio);
  }
  /** 运行时平移已烘焙的运动学 mesh 碰撞（本地空间，不重建 BVH）。 */
  translateKinematicColliderContent(source, localOffset) {
    this.colliders.translateKinematicContent(source, localOffset);
  }
  /** 清除碰撞体；可按 motion 过滤。 */
  clearColliders(filter) {
    this.colliders.clear(filter);
  }
  /** 人物胶囊 / 相机查询用的静态与运动学网格。 */
  getColliderMeshes(options) {
    return this.collisionWorld.queryMeshes({ mask: CHARACTER_QUERY_MASK }, options);
  }
  /** 车辆轮射线 / 车身接触使用的网格。跳过全部车辆外观，车车改走底盘盒。 */
  getVehicleGroundMeshes(v) {
    const chassis = v.chassisColliderId != null ? this.collisionWorld.get(v.chassisColliderId) : null;
    const skipIds = this.vehicle.meshSkipIds;
    skipIds.length = 0;
    for (const other of this.vehicle.list) {
      if (other.meshColliderId != null) skipIds.push(other.meshColliderId);
    }
    if (!chassis) return [];
    return this.collisionWorld.queryMeshes(chassis, { skipIds });
  }
  /** 静态碰撞体是否已有至少一份就绪的 mesh。 */
  isStaticColliderUsable() {
    return this.colliders.isStaticUsable();
  }
  /** 运动学碰撞体是否已就绪。 */
  isKinematicColliderUsable(entry) {
    return this.colliders.isKinematicUsable(entry);
  }
  /** 更新运动学碰撞体网格，并计算本帧位移增量。 */
  updateKinematicColliders() {
    this.colliders.updateKinematicFollow();
  }
  /** 本帧碰撞用完后再提交平台矩阵，供车辆按 prev→current 带走。 */
  commitKinematicPrevMatrices() {
    this.colliders.commitKinematicPrev();
  }
  // ==================== 主循环 ====================
  /** 主循环。 */
  async update(delta) {
    if (delta === void 0) {
      const now = performance.now();
      delta = (now - _lastUpdateTime) / 1e3;
      _lastUpdateTime = now;
    }
    if (!this.isupdate || !this.playerCapsule) return;
    delta = Math.min(delta, 1 / 40) * this.timeScale;
    this.currentDelta = delta;
    this.updateKinematicColliders();
    if (this.controllerMode === 1) {
      this.vehicle.preparePhysics(delta);
      this.vehicle.finishPhysics(delta);
      if (!this.isFirstPerson) this.cam.updateThirdPersonVehicle(delta);
      this.runAnimationPass(delta);
    } else {
      this.updatePlayer(delta);
      this.vehicle.finishPhysics(delta);
    }
    this.dynamics.step(delta);
    this.character.applyDynamicSupportCarry();
    this.commitKinematicPrevMatrices();
  }
  /** 玩家帧更新。 */
  updatePlayer(delta) {
    this.character.update(delta);
  }
  /** 在插件的恢复与应用钩子之间更新动画混合器。 */
  runAnimationPass(delta) {
    for (const plugin of this.plugins) plugin.onBeforeAnimationUpdate?.(delta);
    this.animation.updateMixers(delta);
    for (const plugin of this.plugins) plugin.onAfterAnimationUpdate?.(delta);
  }
  // ==================== 内部辅助 ====================
  /** 同步全部 debug 可见性。 */
  syncDebugVisibility() {
    this.playerDebug.syncVisibility();
    this.colliders.syncDebugVisibility();
    this.dynamics.syncDebugVisibility();
    this.vehicle.syncDebugVisibility();
  }
  /** 设置落地状态。 */
  setOnGround(val) {
    if (!val) this.clearGroundSupport();
    if (this.playerIsOnGround === val) return;
    this.playerIsOnGround = val;
    this.onGroundChange?.(val);
    if (val) this.animation.onLand();
    else this.animation.onBecomeAirborne();
  }
  /** 应用重力。 */
  applyGravity(delta) {
    this.playerVelocity.y += delta * this.gravity;
    this.setOnGround(false);
  }
  /** 判断脚下地面是否为水平台面（法线接近竖直）。 */
  isFlatFloor(hit) {
    const n = hit.face?.normal;
    if (!n) return true;
    return n.y >= this.minFloorNormalY;
  }
  /** 吸附到地面。 */
  snapToGround(groundY, smooth = false, delta = 0) {
    this.playerVelocity.y = 0;
    const dy = groundY - this.playerCapsule.position.y;
    if (smooth && Math.abs(dy) <= this.rideHeight * this.playerModelConfig.scale) {
      this.playerCapsule.position.y += dy * Math.min(1, this.stepSmoothFactor * delta);
    } else {
      this.playerCapsule.position.y = groundY;
    }
    this.setOnGround(true);
  }
  /** 按比例同步重力、速度、相机距离等玩法参数。 */
  applyGameplayScaleRatio(ratio) {
    this.gravity *= ratio;
    this.jumpHeight *= ratio;
    this.playerSpeed *= ratio;
    this.playerRunSpeed *= ratio;
    this.playerFlySpeed *= ratio;
    this.curPlayerSpeed *= ratio;
    this.decelBase *= ratio;
    this.cam.epsilon *= ratio;
    this.cam.minDist *= ratio;
    this.cam.maxDist *= ratio;
    this.cam.originMaxDist *= ratio;
    this.controls.minDistance = this.cam.minDist;
  }
  /** 重算站立 / 落地阈值（snapH / maxH）。仅在胶囊创建、缩放后调用。 */
  recomputeGroundThresholds() {
    const info = this.playerCapsule?.capsuleInfo;
    if (!info) return;
    const sy = this.playerCapsule.scale.y || 1;
    const rideHeightScaled = this.rideHeight * this.playerModelConfig.scale;
    this.snapH = -info.segment.end.y * sy + info.radius + rideHeightScaled;
    this.maxH = this.snapH + rideHeightScaled;
  }
  /** 动态修改玩家缩放。 */
  setPlayerScale(newScale) {
    if (newScale <= 0) return;
    const ratio = newScale / this.playerModelConfig.scale;
    this.playerModelConfig.scale = newScale;
    this.applyGameplayScaleRatio(ratio);
    if (this.isFirstPerson) this.scene.attach(this.camera);
    this.playerCapsule?.scale.multiplyScalar(ratio);
    if (this.playerCapsule?.capsuleInfo) {
      this.playerCapsule.capsuleInfo.radius *= ratio;
      this.recomputeGroundThresholds();
    }
    if (this.isFirstPerson) this.cam.setFirstPerson();
  }
  /** 动态修改单辆车的缩放（绝对 scale，与加载时 opts.scale 同一语义）。 */
  setVehicleScale(vehicle, newScale) {
    this.vehicle.setScale(vehicle, newScale);
  }
  /** 动态修改单辆车的底盘离地间隙（scale=1 基准值）。 */
  setVehicleClearance(vehicle, clearance) {
    this.vehicle.setClearance(vehicle, clearance);
  }
  /** 动态修改单辆车的底盘碰撞盒三轴尺寸比例。 */
  setVehicleChassisSizeScale(vehicle, sizeScale) {
    this.vehicle.setChassisSizeScale(vehicle, sizeScale);
  }
  /** 将全部已加载车辆缩放到同一绝对 scale。 */
  setAllVehiclesScale(newScale) {
    this.vehicle.setScaleAll(newScale);
  }
  /** 重置玩家位置。 */
  reset(position) {
    if (!this.playerCapsule) return;
    if (this.controllerMode === 1) {
      this.vehicle.stopActive();
      this.controllerMode = 0;
      this.mobileControls?.syncControllerModeBtn(0);
      this.scene.attach(this.playerCapsule);
      this.animation.playByName("idle");
      this.syncDebugVisibility();
    }
    this.playerVelocity.set(0, 0, 0);
    this.activeDynamicBody = null;
    this.clearGroundSupport();
    this.playerCapsule.position.copy(position ?? this.initPos);
  }
  /** 站立时胶囊原点应离地的高度。 */
  getCapsuleGroundHeight() {
    return this.snapH;
  }
  /** 运动学碰撞体列表（供车辆下车检测使用）。 */
  getKinematicColliderEntries() {
    return this.colliders.kinematicColliders;
  }
  /** 将人物模型挂载到车辆座位点。 */
  syncMountedPlayer(vehicle) {
    const cap = this.playerCapsule;
    if (!cap) return;
    this.clearGroundSupport();
    if (cap.parent !== vehicle.vehicleGroup) vehicle.vehicleGroup.attach(cap);
    cap.position.copy(vehicle.driverSeatPosition).multiplyScalar(vehicle.scale);
    cap.quaternion.setFromAxisAngle(this.upVector, vehicle.driverSeatRotation);
  }
  /** 在车辆下车位置恢复人物控制。 */
  leaveVehicleAt(position, forward) {
    const cap = this.playerCapsule;
    if (!cap) return;
    this.scene.attach(cap);
    cap.position.copy(position);
    const lookTarget = position.clone().add(forward);
    this.targetMat.lookAt(position, lookTarget, this.upVector);
    cap.quaternion.setFromRotationMatrix(this.targetMat);
    this.playerVelocity.set(0, 0, 0);
    this.setOnGround(false);
    if (this.isFirstPerson) this.cam.setFirstPerson();
  }
  // ==================== API ====================
  /** 获取当前位置。 */
  getPosition() {
    return this.playerCapsule?.position;
  }
  /** 获取速度。 */
  getVelocity() {
    return this.playerVelocity.clone();
  }
  /** 获取第一人称状态。 */
  getIsFirstPerson() {
    return this.isFirstPerson;
  }
  /** 获取飞行状态。 */
  getIsFlying() {
    return this.isFlying;
  }
  /** 获取落地状态。 */
  getIsOnGround() {
    return this.playerIsOnGround;
  }
  /** 获取移动系统本帧最终采用的地面支撑。 */
  getGroundSupport() {
    return this.hasGroundSupport ? this.groundSupportHit : null;
  }
  /** 获取本帧实际使用的 delta（已钳制 + timeScale）。 */
  getCurrentDelta() {
    return this.currentDelta;
  }
  /** 获取控制器模式。 */
  getControllerMode() {
    return this.controllerMode;
  }
  /** 获取玩家模型。 */
  getPlayerModel() {
    return this.playerModel;
  }
  /** 获取胶囊体。 */
  getPlayerCapsule() {
    return this.playerCapsule;
  }
  /** 获取当前载具。 */
  getActiveVehicle() {
    return this.vehicle.active;
  }
  /** 获取所有载具。 */
  getAllVehicles() {
    return this.vehicle.list;
  }
  /** 获取当前站立的运动学碰撞体。 */
  getActiveKinematicCollider() {
    return this.activeKinematicCollider;
  }
  /** 获取当前站立的动态刚体。 */
  getActiveDynamicBody() {
    return this.activeDynamicBody;
  }
  /** 写入移动系统最终采用的地面点和世界空间法线。 */
  setGroundSupport(point, normal) {
    this.groundSupportHit.point.copy(point);
    this.groundSupportHit.normal.copy(normal).normalize();
    this.hasGroundSupport = true;
  }
  /** 清除已经失效的地面支撑。 */
  clearGroundSupport() {
    this.hasGroundSupport = false;
  }
  /** 移除动态刚体。 */
  removeDynamicBody(body) {
    this.dynamics.remove(body);
  }
  /** 从指定世界坐标向下查询动态刚体表面。 */
  raycastDynamicGround(origin, minNormalY, excludeKinds) {
    return this.dynamics.raycastGround(origin, minNormalY, excludeKinds);
  }
  /** 全部动态刚体。 */
  getDynamicBodies() {
    return this.dynamics.list;
  }
  /** 清除全部动态刚体。 */
  clearDynamicBodies() {
    this.dynamics.clear();
  }
  /** 设置鼠标灵敏度。 */
  setMouseSensitivity(value) {
    this.cam.sensitivity = value;
    this.controls.rotateSpeed = value * 0.05;
  }
  // --- 玩家参数 ---
  /** 设置重力。 */
  setGravity(gravity) {
    this.gravity = gravity * this.playerModelConfig.scale;
  }
  /** 设置跳跃高度。 */
  setJumpHeight(jumpHeight) {
    this.jumpHeight = jumpHeight * this.playerModelConfig.scale;
  }
  /** 设置行走速度。 */
  setPlayerSpeed(speed) {
    this.playerSpeed = speed * this.playerModelConfig.scale;
    this.curPlayerSpeed = this.playerSpeed;
  }
  /** 设置跑步速度。 */
  setPlayerRunSpeed(runSpeed) {
    this.playerRunSpeed = runSpeed * this.playerModelConfig.scale;
  }
  /** 设置飞行速度。 */
  setPlayerFlySpeed(flySpeed) {
    this.playerFlySpeed = flySpeed * this.playerModelConfig.scale;
  }
  /** 设置朝向开关。 */
  setEnableToward(v) {
    this.enableToward = v;
  }
  // --- 相机参数 ---
  /** 设置相机最近距。 */
  setMinCamDistance(dist) {
    this.cam.minDist = dist * this.playerModelConfig.scale;
    this.cam.originMaxDist = Math.max(this.cam.originMaxDist, this.cam.minDist);
    this.cam.maxDist = Math.max(this.cam.maxDist, this.cam.minDist);
    this.controls.minDistance = this.cam.minDist;
  }
  /** 设置相机最远距。 */
  setMaxCamDistance(dist) {
    this.cam.originMaxDist = Math.max(this.cam.minDist, dist * this.playerModelConfig.scale);
    this.cam.maxDist = this.cam.originMaxDist;
    this.cam.clearFlySprintMaxDistBoost();
  }
  /** 设置相机看向点高度比例。 */
  setCamLookAtHeightRatio(ratio) {
    this.cam.lookAtHeightRatio = ratio;
  }
  /** 设置相机过肩视角横向偏移比例。 */
  setCamOverShoulderOffsetRatio(ratio) {
    this.cam.overShoulderOffsetRatio = ratio;
    this.cam.setOverShoulder(this.enableOverShoulderView && !this.isFirstPerson);
  }
  /** 设置鼠标模式。 */
  setThirdMouseMode(mode) {
    this.cam.mouseMode = mode;
    this.cam.setPointerLock();
  }
  /** 设置缩放开关。 */
  setEnableZoom(enable) {
    this.cam.setZoomEnabled(enable);
  }
  // --- 调试 ---
  /** 设置静态碰撞线框。 */
  setColliderDebug(debug) {
    this.colliders.setDebugVisible(debug);
  }
  /** 设置玩家胶囊线框。 */
  setPlayerCapsuleDebug(debug) {
    this.playerDebug.setVisible(debug);
  }
  /** 设置动态刚体碰撞线框。 */
  setDynamicBodyDebug(debug) {
    this.dynamics.setDebugVisible(debug);
  }
  /** 设置车辆底盘物理盒。 */
  setVehiclePhysicsDebug(debug) {
    this.vehicle.setPhysicsDebugVisible(debug);
  }
  /** 临时跳过玩家胶囊碰撞检测。 */
  setSkipCapsuleCollision(skip) {
    this.skipCapsuleCollision = skip;
  }
  // --- 动画 ---
  /** 按名播放动画。 */
  playPlayerAnimationByName(name, fade) {
    this.animation.playByName(name, fade);
  }
  /** 注册自定义动画。 */
  registerAnimation(key, clipName, opts) {
    this.animation.register(key, clipName, opts);
  }
  /** 播放已注册动画。 */
  playAnimation(key, opts) {
    this.animation.play(key, opts);
  }
  /** 注册移动动作组。 */
  registerLocomotionSet(setName, map) {
    this.animation.registerLocomotionSet(setName, map);
  }
  /** 切换移动动作组。 */
  switchLocomotionSet(setName, fade) {
    this.animation.switchLocomotionSet(setName, fade);
  }
  /** 获取当前动画名。 */
  getCurrentPlayerAnimationName() {
    return this.animation.getCurrentName();
  }
  /** 获取当前移动动作组名。 */
  getCurrentLocomotionSet() {
    return this.animation.currentLocomotionSet;
  }
  // --- 相机 ---
  /** 切换视角模式。 */
  changeView() {
    this.cam.changeView();
  }
  /** 设置第一人称。 */
  setFirstPersonCamera(v = 0) {
    this.cam.setFirstPerson(v);
  }
  /** 设置越肩视角。 */
  setOverShoulderView(v) {
    this.cam.setOverShoulder(v);
    this.enableOverShoulderView = v;
  }
  /** 屏幕中心检测。 */
  getCenterScreenRaycastHit() {
    return this.cam.getCenterHit();
  }
  // --- 输入 ---
  /** 设置输入状态。 */
  setInput(input) {
    this.input.setInput(input);
  }
  /** 运行时自定义键位。 */
  setKeyMap(map) {
    this.input.buildKeyMap(map);
  }
  /** 绑定输入事件。 */
  onAllEvent() {
    this.input.bindEvents();
  }
  /** 解绑输入事件。 */
  offAllEvent() {
    this.input.unbindEvents();
  }
  // --- 载具 ---
  /** 加载车辆模型。 */
  loadVehicleModel(opts) {
    return this.vehicle.load(opts);
  }
  /** 将当前驾驶车辆翻正复位。 */
  resetVehicle() {
    this.vehicle.resetUpright();
  }
  // --- 销毁 ---
  /** 销毁控制器并释放资源。 */
  destroy() {
    this.input.unbindEvents();
    for (const plugin of this.plugins.slice()) {
      this.unuse(plugin);
      plugin.dispose?.();
    }
    this.plugins = [];
    this.playerDebug.dispose();
    if (this.playerCapsule) {
      this.playerCapsule.remove(this.camera);
      this.scene.remove(this.playerCapsule);
    }
    this.playerCapsule = null;
    if (this.playerModel) {
      this.scene.remove(this.playerModel);
      this.playerModel = null;
    }
    this.cam.resetControls();
    this.clearColliders();
    this.mobileControls?.destroy();
    this.mobileControls = null;
    this.bvhWorkerPool.dispose();
    this.vehicle.destroy();
    this.dynamics.clear();
    this.collisionWorld.clear();
  }
};
export {
  ALL_COLLISION_MASK,
  BVHVehicleController,
  CHARACTER_QUERY_MASK,
  CONTACT_REF_EXTENT,
  CONTACT_SKIN,
  CollisionGroup,
  CollisionWorld,
  ContactImpulseSolver,
  ContactManifold,
  ContactPoint,
  DYNAMIC_BODY_DEFAULTS,
  DynamicBody,
  DynamicBoxBody,
  DynamicSphereBody,
  VehicleRigidBody,
  contactSkinForExtent,
  isBoxBody,
  isSphereBody,
  playerController
};
//# sourceMappingURL=index.mjs.map