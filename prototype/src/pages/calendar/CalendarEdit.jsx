import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui'
import { useAuth } from '../../context/AuthContext.jsx'
import { getEvent } from '../../lib/api.js'
import EventForm from './EventForm.jsx'

export default function CalendarEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { mockMode } = useAuth()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(!mockMode)

  useEffect(() => {
    if (mockMode) return
    let alive = true
    getEvent(id)
      .then((ev) => {
        if (!alive) return
        if (!ev) return navigate('/calendar', { replace: true })
        setEvent(ev)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id, mockMode, navigate])

  if (loading) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }

  return <EventForm event={event} eventId={id} />
}
