<script setup>
import { reactive, ref } from 'vue'

defineProps({ loading: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['login'])
const form = reactive({ username: '', password: '' })
const showPassword = ref(false)

/** 提交用户名密码；实际认证由后端 Session 接口完成，前端不保存密码。 */
function submit(event) {
  const values = new FormData(event.currentTarget)
  const username = String(values.get('username') || '').trim()
  const password = String(values.get('password') || '')
  if (!username || !password) return
  form.username = username
  form.password = password
  emit('login', { username, password })
}
</script>

<template>
  <main class="login-page">
    <div class="ambient-grid" aria-hidden="true"></div>
    <section class="access-console" aria-label="报文模拟系统登录">
      <div class="system-stage">
        <header class="system-brand">
          <span class="brand-mark">MS</span>
          <div><b>报文模拟系统</b><small>MESSAGE SIMULATION</small></div>
        </header>

        <div class="stage-copy">
          <p class="stage-eyebrow">报文模拟工作台</p>
          <h1 class="stage-title">
            <span>报文构造</span>
            <i aria-hidden="true"><b></b><small>生成链路</small></i>
            <em>链路验证</em>
          </h1>
          <p class="stage-description">统一完成模板配置、数据生成、消息投递与执行追溯，让每次联调都有清晰证据。</p>
        </div>

        <div class="message-rail" aria-label="报文模拟工作流">
          <div class="rail-line" aria-hidden="true"><span></span></div>
          <div class="rail-step active"><i>01</i><b>定义模板</b><small>配置报文结构</small></div>
          <div class="rail-step"><i>02</i><b>生成内容</b><small>绑定模拟数据</small></div>
          <div class="rail-step"><i>03</i><b>发送消息</b><small>投递消息云</small></div>
          <div class="rail-step"><i>04</i><b>查看结果</b><small>追踪执行证据</small></div>
        </div>
      </div>

      <div class="auth-stage">
        <form class="login-card" @submit.prevent="submit">
          <header>
            <span class="auth-index">系统登录</span>
            <h2>欢迎回来</h2>
            <p>使用系统账号登录，继续管理模拟任务。</p>
          </header>

          <div v-if="error" class="login-error" role="alert"><b>登录未完成</b><span>{{ error }}</span></div>

          <label for="login-username">用户名</label>
          <div class="field-shell">
            <span class="field-prefix" aria-hidden="true">ID</span>
            <input id="login-username" v-model="form.username" name="username" autocomplete="username" autofocus required placeholder="请输入用户名">
          </div>

          <label for="login-password">密码</label>
          <div class="field-shell">
            <span class="field-prefix" aria-hidden="true">••</span>
            <input id="login-password" v-model="form.password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required placeholder="请输入密码">
            <button class="password-toggle" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</button>
          </div>

          <button class="login-button" type="submit" :disabled="loading">
            <span>{{ loading ? '正在验证身份…' : '进入控制台' }}</span><i aria-hidden="true">→</i>
          </button>

          <div class="access-note"><span aria-hidden="true">⌁</span><p><b>企业内部系统</b><small>账号或权限问题请联系系统管理员</small></p></div>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page { position: relative; display: grid; min-width: 1080px; min-height: 100vh; place-items: center; overflow: hidden; padding: 28px 48px; background: linear-gradient(145deg, #001529 0%, #07111f 52%, #0b2036 100%); color: #fff; }
.ambient-grid { position: absolute; inset: 0; opacity: .72; background-image: linear-gradient(#8bbef108 1px, transparent 1px), linear-gradient(90deg, #8bbef108 1px, transparent 1px); background-size: 42px 42px; mask-image: radial-gradient(circle at 50% 45%, #000 0, transparent 72%); }
.login-page::before { position: absolute; top: -220px; left: 20%; width: 620px; height: 620px; border-radius: 50%; background: #1677ff17; filter: blur(80px); content: ''; }
.login-page::after { position: absolute; right: 4%; bottom: -240px; width: 500px; height: 500px; border: 1px solid #fa8c1626; border-radius: 50%; box-shadow: 0 0 120px #fa8c1608; content: ''; }
.access-console { position: relative; z-index: 1; display: grid; width: min(1120px, calc(100vw - 96px)); min-height: 650px; grid-template-columns: 1.22fr .78fr; overflow: hidden; border: 1px solid #6caaf12b; border-radius: 12px; background: #07192b; box-shadow: 0 32px 100px #00081480, 0 0 0 1px #ffffff05 inset; }
.system-stage { position: relative; display: flex; min-width: 0; flex-direction: column; padding: 34px 40px 30px; overflow: hidden; }
.system-stage::after { position: absolute; top: 112px; right: -210px; width: 460px; height: 460px; border: 1px solid #1677ff26; border-radius: 50%; box-shadow: 0 0 0 72px #1677ff08, 0 0 0 144px #1677ff05; content: ''; }
.system-brand { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 7px; background: #1677ff; color: #fff; font-weight: 800; letter-spacing: -.04em; box-shadow: 0 7px 20px #1677ff42; }
.system-brand b, .system-brand small { display: block; }.system-brand b { font-size: 16px; }.system-brand small { margin-top: 3px; color: #7189a1; font: 10px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .09em; }
.stage-copy { position: relative; z-index: 1; margin: auto 0 42px; }
.stage-eyebrow { margin: 0 0 18px; color: #69b1ff; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
.stage-title { display: grid; width: min(520px, 100%); grid-template-columns: auto minmax(90px, 1fr); align-items: end; margin: 0; color: #f4f8fc; font-size: clamp(42px, 3.5vw, 56px); font-weight: 680; line-height: 1.06; letter-spacing: -.055em; }
.stage-title > span { grid-column: 1; white-space: nowrap; }
.stage-title > i { display: flex; min-width: 150px; align-items: center; gap: 9px; margin: 0 0 8px 16px; color: #6f879d; font-style: normal; }.stage-title > i b { position: relative; height: 1px; flex: 1; background: linear-gradient(90deg, #1677ff, #31506c); }.stage-title > i b::after { position: absolute; top: -3px; right: 0; width: 7px; height: 7px; border-radius: 50%; background: #69b1ff; box-shadow: 0 0 9px #1677ff; content: ''; }.stage-title > i small { flex: none; font-size: 11px; font-weight: 600; letter-spacing: .06em; white-space: nowrap; }
.stage-title > em { grid-column: 1 / -1; margin-top: 7px; padding-left: clamp(54px, 5vw, 82px); color: #8fc5ff; font-style: normal; white-space: nowrap; }
.stage-description { max-width: 540px; margin: 22px 0 0; color: #8fa4b8; font-size: 14px; line-height: 1.8; }
.message-rail { position: relative; z-index: 2; display: grid; grid-template-columns: repeat(4, 1fr); margin: 0 0 42px; }
.rail-line { position: absolute; top: 13px; right: 12.5%; left: 12.5%; height: 1px; overflow: hidden; background: #29445e; }.rail-line span { display: block; width: 38%; height: 100%; background: linear-gradient(90deg, transparent, #69b1ff, transparent); animation: packet-trace 3.6s ease-in-out infinite; }
.rail-step { position: relative; display: grid; justify-items: center; color: #738ba1; }.rail-step i { display: grid; width: 27px; height: 27px; place-items: center; border: 1px solid #36546f; border-radius: 50%; background: #0b2135; color: #8098ad; font: normal 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }.rail-step b { margin-top: 10px; color: #c2d0dc; font-size: 13px; }.rail-step small { margin-top: 4px; color: #7189a1; font-size: 11px; line-height: 1.3; }.rail-step.active i { border-color: #69b1ff; background: #1677ff; color: #fff; box-shadow: 0 0 0 4px #1677ff20, 0 0 18px #1677ff38; }
.auth-stage { position: relative; display: grid; place-items: center; padding: 54px 46px; background: #f7f8fa; color: #262626; }.auth-stage::before { position: absolute; inset: 0 auto 0 0; width: 1px; background: linear-gradient(transparent, #7fb8f566 18%, #7fb8f566 82%, transparent); content: ''; }
.login-card { width: 100%; max-width: 350px; }
.login-card header { margin-bottom: 34px; }.auth-index { color: #1677ff; font-size: 12px; font-weight: 700; letter-spacing: .08em; }.login-card h2 { margin: 13px 0 0; color: #17243a; font-size: 28px; font-weight: 720; letter-spacing: -.025em; }.login-card header p { margin: 8px 0 0; color: #7d8998; font-size: 14px; }
.login-card > label { display: block; margin: 19px 0 7px; color: #465568; font-size: 12px; font-weight: 650; }
.field-shell { position: relative; display: flex; height: 46px; align-items: center; border: 1px solid #d4dae2; border-radius: 6px; background: #fff; transition: border-color .18s, box-shadow .18s; }.field-shell:focus-within { border-color: #1677ff; box-shadow: 0 0 0 3px #1677ff17; }.field-prefix { display: grid; width: 44px; height: 22px; flex: 0 0 auto; place-items: center; border-right: 1px solid #e8ebef; color: #8794a5; font: 650 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }.field-shell input { min-width: 0; height: 100%; flex: 1; padding: 0 12px; border: 0; outline: 0; background: transparent; color: #26384c; font-size: 14px; }.field-shell input::placeholder { color: #adb5c0; }.password-toggle { height: 30px; margin-right: 6px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: #738196; font-size: 11px; }.password-toggle:hover { background: #f0f5ff; color: #1677ff; }
.login-button { display: flex; width: 100%; height: 46px; align-items: center; justify-content: space-between; margin-top: 28px; padding: 0 17px; border: 1px solid #1677ff; border-radius: 6px; background: #1677ff; color: #fff; font-size: 14px; font-weight: 680; box-shadow: 0 9px 22px #1677ff2b; transition: background .16s, border-color .16s, transform .16s, box-shadow .16s; }.login-button i { font-size: 18px; font-style: normal; transition: transform .16s; }.login-button:hover:not(:disabled) { border-color: #4096ff; background: #4096ff; box-shadow: 0 11px 26px #1677ff38; transform: translateY(-1px); }.login-button:hover:not(:disabled) i { transform: translateX(3px); }.login-button:disabled { border-color: #a9caf8; background: #a9caf8; box-shadow: none; cursor: not-allowed; }
.login-error { display: grid; gap: 2px; margin-bottom: 20px; padding: 10px 12px; border: 1px solid #ffccc7; border-radius: 6px; background: #fff2f0; color: #a8071a; font-size: 12px; }.login-error b { color: #cf1322; }.login-error span { overflow-wrap: anywhere; }
.access-note { display: flex; align-items: center; gap: 10px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #e8ebef; color: #8a96a5; }.access-note > span { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #dfe4ea; border-radius: 50%; color: #718096; }.access-note p, .access-note b, .access-note small { display: block; margin: 0; }.access-note b { color: #5c6878; font-size: 11px; }.access-note small { margin-top: 2px; color: #9aa4b1; font-size: 10px; }
@keyframes packet-trace { 0% { transform: translateX(-100%); opacity: 0; } 18%, 78% { opacity: 1; } 100% { transform: translateX(270%); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rail-line span { animation: none; transform: translateX(80%); } }
</style>
