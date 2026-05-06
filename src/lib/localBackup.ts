export type LocalStorageBackup = {
  exportedAt: string
  appName: string
  version: 1
  localStorage: Record<string, string>
}

const backupPrefixAllowList = [
  'solar-race-',
]

export function exportLocalStorageBackup(): LocalStorageBackup {
  const localStorageData: Record<string, string> = {}

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (!key || !shouldIncludeKey(key)) {
      continue
    }

    const value = window.localStorage.getItem(key)

    if (value !== null) {
      localStorageData[key] = value
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    appName: 'Solar Race Strategy Dashboard',
    version: 1,
    localStorage: localStorageData,
  }
}

export function importLocalStorageBackup(json: unknown) {
  const backup = validateBackup(json)

  for (const [key, value] of Object.entries(backup.localStorage)) {
    if (shouldIncludeKey(key)) {
      window.localStorage.setItem(key, value)
    }
  }

  window.dispatchEvent(new CustomEvent('solar-race-local-backup-imported'))

  return backup
}

export function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)))
      } catch {
        reject(new Error('Selected file is not valid JSON.'))
      }
    }

    reader.onerror = () => reject(new Error('Could not read selected file.'))
    reader.readAsText(file)
  })
}

function validateBackup(json: unknown): LocalStorageBackup {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('localStorage' in json) ||
    typeof (json as { localStorage: unknown }).localStorage !== 'object' ||
    (json as { localStorage: unknown }).localStorage === null
  ) {
    throw new Error('Backup file does not match the expected format.')
  }

  const rawLocalStorage = (json as { localStorage: Record<string, unknown> })
    .localStorage
  const localStorageData: Record<string, string> = {}

  for (const [key, value] of Object.entries(rawLocalStorage)) {
    if (typeof value === 'string') {
      localStorageData[key] = value
    }
  }

  const exportedAt =
    'exportedAt' in json && typeof json.exportedAt === 'string'
      ? json.exportedAt
      : new Date().toISOString()

  return {
    exportedAt,
    appName: 'Solar Race Strategy Dashboard',
    version: 1,
    localStorage: localStorageData,
  }
}

function shouldIncludeKey(key: string) {
  return backupPrefixAllowList.some((prefix) => key.startsWith(prefix))
}
