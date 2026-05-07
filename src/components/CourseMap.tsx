'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type CourseMapClientComponent from '@/components/CourseMapClient'

const CourseMapClient = dynamic(() => import('@/components/CourseMapClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/10 bg-[#151515] text-sm font-semibold text-[#cfcfcf]">
      Loading course map...
    </div>
  ),
})

export default function CourseMap(
  props: ComponentProps<typeof CourseMapClientComponent>
) {
  return <CourseMapClient {...props} />
}
