import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <header className="top">
        <h1>Сторінку не знайдено</h1>
      </header>
      <p className="lead">Такої сторінки немає. Графіки відключень усіх груп на головній.</p>
      <Link className="button" href="/">
        До вибору групи
      </Link>
    </main>
  )
}
