import React from 'react'
import type { Tag } from '../api/types'
import Icons from './ui/Icons'

interface TagChipProps {
    tag: Tag
    onClick?: (tag: Tag) => void
    onDelete?: (tag: Tag) => void
    size?: 'xs' | 'sm' | 'md'
    className?: string
    selected?: boolean
    interactive?: boolean
}

export default function TagChip({ tag, onClick, onDelete, size = 'sm', className = '', selected = false, interactive = false }: TagChipProps) {
    const sizeClasses = {
        xs: 'px-1.5 py-0.5 text-[10px]',
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-sm'
    }

    const handleClick = (e: React.MouseEvent) => {
        if (onClick) {
            e.stopPropagation()
            onClick(tag)
        }
    }

    const handleDelete = (e: React.MouseEvent) => {
        if (onDelete) {
            e.stopPropagation()
            onDelete(tag)
        }
    }

    // Determine style based on color
    // Use a light background with the tag color as border/text, or filled if selected
    const style = selected
        ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
        : { borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}15` } // 15 = ~10% opacity

    const hoverClass = (interactive || onClick) ? 'hover:opacity-80 cursor-pointer' : ''

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border font-medium transition-all ${sizeClasses[size]} ${hoverClass} ${className}`}
            style={style}
            onClick={handleClick}
        >
            {tag.name}
            {onDelete && (
                <button
                    onClick={handleDelete}
                    className="ml-0.5 opacity-60 hover:opacity-100 focus:outline-none"
                >
                    <Icons.X className={size === 'md' ? "w-3.5 h-3.5" : "w-3 h-3"} />
                </button>
            )}
        </span>
    )
}
