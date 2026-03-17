import { createRouter, createWebHistory } from 'vue-router'
import HomeFeed from '../views/HomeFeed.vue'
import DictionaryView from '../views/DictionaryView.vue'
import SecurityLab from '../views/SecurityLab.vue'

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
    },
    {
      path: '/lab',
      name: 'SecurityLab',
      component: SecurityLab
    }
  ]
})

export default router
