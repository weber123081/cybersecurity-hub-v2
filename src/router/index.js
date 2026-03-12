import { createRouter, createWebHistory } from 'vue-router'
import HomeFeed from '../views/HomeFeed.vue'
import DictionaryView from '../views/DictionaryView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: HomeFeed
    },
    {
      path: '/dictionary',
      name: 'Dictionary',
      component: DictionaryView
    }
  ]
})

export default router
