<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入搜索内容' },
  ariaLabel: { type: String, default: '搜索' }
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <span class="search-input">
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
    <input
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      :value="modelValue"
      @input="emit('update:modelValue', $event.target.value)"
    >
    <button
      v-if="modelValue"
      type="button"
      :aria-label="`清空${ariaLabel}`"
      @click="emit('update:modelValue', '')"
    >×</button>
  </span>
</template>

<style scoped>
.search-input {
  display: flex;
  width: 100%;
  height: 38px;
  align-items: center;
  padding: 0 11px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  transition: border-color .2s, box-shadow .2s;
}

.search-input:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgb(22 119 255 / 10%);
}

svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  margin-right: 8px;
  fill: none;
  stroke: #909399;
  stroke-linecap: round;
  stroke-width: 1.8;
}

input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #3f4f66;
  font-size: 13px;
  line-height: 36px;
}

input:focus-visible { outline: 0; }

input::placeholder { color: #a8abb2; }

button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #c0c4cc;
  color: #fff;
  font-size: 15px;
  line-height: 18px;
}

button:hover { background: #909399; }
</style>
