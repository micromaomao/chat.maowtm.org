"use client"

import { Skeleton, SkeletonItem } from "@/app/uicomponents"

export default function AdminSkeleton() {
  return (
    <Skeleton appearance="opaque">
      <SkeletonItem />
      <div style={{ height: '18px' }} />
      <SkeletonItem />
      <div style={{ height: '18px' }} />
      <SkeletonItem />
    </Skeleton>
  )
}
