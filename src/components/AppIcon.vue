<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 18 }
})

const paths = {
  overview: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  tasks: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  messages: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  data: ['M4 5c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3Z', 'M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'],
  components: ['M6 6h12', 'M6 18h12', 'M12 6v12', 'M6 6l6 6 6-6', 'M6 18l6-6 6 6'],
  logs: ['M5 3h14v18H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm16.5 16.5 4 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  bolt: ['m13 2-8 12h7l-1 8 8-12h-7z'],
  check: ['m5 12 4 4L19 6'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  arrow: ['M5 12h14', 'm14 7 5 5-5 5'],
  back: ['M19 12H5', 'm10 17-5-5 5-5'],
  play: ['M7 4.5v15l12-7.5z'],
  refresh: ['M20 6v5h-5', 'M4 18v-5h5', 'M18.5 9A7 7 0 0 0 6 6.5L4 11', 'M5.5 15A7 7 0 0 0 18 17.5l2-4.5'],
  logout: ['M10 5H5v14h5', 'M14 8l4 4-4 4', 'M8 12h10']
}
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path v-for="path in paths[name] || []" :key="path" :d="path" />
  </svg>
</template>

<style scoped>
.app-icon { display: block; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
</style>
