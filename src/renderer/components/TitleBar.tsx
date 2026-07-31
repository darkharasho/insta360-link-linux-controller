import { Minus, Square, X } from 'lucide-react'
import iconUrl from '../assets/icon.png'
import { windowControls } from '../api'

export function TitleBar() {
  return (
    <div className="app-drag flex h-9 shrink-0 select-none items-center justify-between border-b bg-card/60 pl-3">
      <div className="flex items-center gap-2">
        <img src={iconUrl} alt="" className="h-4 w-4 rounded" />
        <span className="text-xs font-medium text-muted-foreground">Insta360 Link Controller</span>
      </div>
      <div className="app-no-drag flex items-center">
        <button
          onClick={() => windowControls.minimize()}
          aria-label="Minimize"
          className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => windowControls.toggleMaximize()}
          aria-label="Maximize"
          className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => windowControls.close()}
          aria-label="Close"
          className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
