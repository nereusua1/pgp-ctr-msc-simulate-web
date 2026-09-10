<script setup>
import { reactive } from 'vue'

defineProps({ loading: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['login'])
const form = reactive({ username: '', password: '' })

/** 提交用户名密码；实际认证由后端 Session 接口完成，前端不保存密码。 */
function submit() {
  if (!form.username || !form.password) return
  emit('login', { username: form.username, password: form.password })
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel">
      <div class="login-brand"><span>MS</span><div><b>报文模拟系统</b><small>MESSAGE SIMULATION</small></div></div>
      <div class="brand-copy"><p>MESSAGE SIMULATION CONSOLE</p><h1>把每一次模拟投递，<br>变成可追溯的执行证据。</h1><span>面向测试与联调场景的企业级报文模拟控制台</span></div>
      <div class="brand-foot">企业内部系统</div>
    </section>
    <section class="login-form-panel">
      <form class="login-card" @submit.prevent="submit">
        <header><span class="mobile-logo">MS</span><div><small>WELCOME BACK</small><h2>登录控制台</h2><p>使用系统账号登录</p></div></header>
        <div v-if="error" class="login-error" role="alert">{{ error }}</div>
        <label>用户名<input v-model="form.username" name="username" autocomplete="username" autofocus placeholder="请输入用户名"></label>
        <label>密码<input v-model="form.password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码"></label>
        <button class="login-button" type="submit" :disabled="loading || !form.username || !form.password">{{ loading ? '正在登录…' : '登录' }}</button>
        <p class="login-hint">报文模拟系统<br>请联系系统管理员获取账号</p>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; grid-template-columns: minmax(420px, 44%) 1fr; min-height: 100vh; background: #f5f5f5; }
.login-brand-panel { position: relative; display: flex; flex-direction: column; min-height: 100vh; padding: 42px 7.5%; overflow: hidden; background: #15223d; color: #fff; }
.login-brand-panel::before, .login-brand-panel::after { position: absolute; content: ''; border: 1px solid #ffffff14; border-radius: 50%; }
.login-brand-panel::before { width: 420px; height: 420px; right: -180px; bottom: -120px; }
.login-brand-panel::after { width: 260px; height: 260px; right: -70px; bottom: -40px; background: #48c9b60b; }
.login-brand { position: relative; z-index: 1; display: flex; align-items: center; gap: 13px; }
.login-brand > span, .mobile-logo { position: relative; display: grid; width: 44px; height: 44px; place-items: center; overflow: hidden; border-radius: 8px; background: #fff; color: #15223d; font-weight: 800; }
.login-brand > span::after { position: absolute; right: -4px; bottom: -4px; width: 15px; height: 15px; border-radius: 50%; background: #557ff3; content: ''; }
.login-brand b { display: block; font-size: 18px; }
.login-brand small { display: block; margin-top: 3px; color: #9fb0c3; font-size: 10px; letter-spacing: .08em; }
.brand-copy { position: relative; z-index: 1; margin: auto 0; }
.brand-copy p { margin: 0 0 18px; color: #8da9ff; font-size: 11px; font-weight: 700; letter-spacing: .14em; }
.brand-copy h1 { margin: 0; max-width: 590px; font-size: clamp(36px, 3.2vw, 50px); font-weight: 650; line-height: 1.3; letter-spacing: -.045em; }
.brand-copy span { display: block; margin-top: 22px; color: #aebcce; font-size: 15px; }
.brand-foot { position: relative; z-index: 1; color: #8295a8; font-size: 12px; }
.login-form-panel { display: grid; place-items: center; padding: 36px; }
.login-card { width: min(420px, 100%); padding: 40px 42px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px #0000000f; }
.login-card header { display: flex; align-items: center; gap: 13px; margin-bottom: 30px; }
.login-card header small { display: block; margin-bottom: 16px; color: #4e72e8; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.login-card h2 { margin: 0; color: #17243a; font-size: 25px; font-weight: 700; }
.login-card header p { margin: 6px 0 0; color: #667085; }
.mobile-logo { display: none; flex: 0 0 44px; }
.login-card label { display: block; margin-top: 18px; color: #606266; font-size: 13px; font-weight: 600; }
.login-card input { display: block; width: 100%; height: 44px; margin-top: 8px; padding: 0 13px; border: 1px solid #d9d9d9; border-radius: 6px; outline: none; background: #fff; color: #262626; transition: border-color .2s, box-shadow .2s; }
.login-card input:focus { border-color: #1677ff; box-shadow: 0 0 0 3px #1677ff1a; }
.login-card input::placeholder { color: #a8abb2; }
.login-button { width: 100%; height: 44px; margin-top: 26px; border: 1px solid #1677ff; border-radius: 6px; background: #1677ff; color: #fff; font-weight: 650; transition: background .15s; }
.login-button:hover:not(:disabled) { border-color: #4096ff; background: #4096ff; }
.login-button:disabled { opacity: .55; cursor: not-allowed; }
.login-error { padding: 10px 12px; border: 1px solid #fab6b6; border-radius: 4px; background: #fef0f0; color: #c45656; font-size: 13px; }
.login-hint { margin: 16px 0 0; color: #909399; font-size: 12px; text-align: center; }
@media (max-width: 820px) {
  .login-page { grid-template-columns: 1fr; }
  .login-brand-panel { display: none; }
  .login-form-panel { padding: 22px; }
  .login-card { padding: 32px 28px; }
  .mobile-logo { display: grid; }
}
</style>
