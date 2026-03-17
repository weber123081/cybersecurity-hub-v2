<template>
  <div class="skeleton-card">
    <div class="skeleton-header">
      <div class="skeleton-avatar pulse"></div>
      <div class="skeleton-meta">
        <div class="skeleton-line short pulse"></div>
        <div class="skeleton-line medium pulse"></div>
      </div>
    </div>
    <div class="skeleton-body">
      <div class="skeleton-title pulse"></div>
      <div class="skeleton-text pulse"></div>
      <div class="skeleton-text pulse"></div>
      <div class="skeleton-text pulse"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-card {
  background-color: var(--bg-card);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.skeleton-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: var(--bg-main);
}

.skeleton-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton-line {
  height: 12px;
  border-radius: 4px;
  background-color: var(--bg-main);
}

.skeleton-line.short { width: 30%; }
.skeleton-line.medium { width: 60%; }

.skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-title {
  height: 24px;
  width: 80%;
  border-radius: 4px;
  background-color: var(--bg-main);
  margin-bottom: 0.5rem;
}

.skeleton-text {
  height: 14px;
  width: 100%;
  border-radius: 4px;
  background-color: var(--bg-main);
}

.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>
