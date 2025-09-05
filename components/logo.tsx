export default function Logo({
  className,
  ...props
}: React.HTMLProps<HTMLDivElement>) {
  return (
    <div className={`flex items-center gap-2 ${className}`} {...props}>
      {/* Code Homie Logo - Using the provided image */}
      <img 
        src="https://i.imgur.com/YjlgFGU.png" 
        alt="Code Homie Logo" 
        className="h-8 w-8"
      />
      <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
        Code Homie
      </span>
    </div>
  )
}
