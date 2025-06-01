<script setup>
import { RouterView } from "vue-router";
</script>

<template>
  <RouterView />
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #18191f;
}
#app {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 1;
}
</style>
