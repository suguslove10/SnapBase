package backup

import (
	"log"
	"sync"

	"github.com/suguslove10/snapbase/models"
)

const maxConcurrentBackups = 5

// Queue serialises backup requests so at most maxConcurrentBackups run at once.
// Extra jobs wait in a buffered channel (capacity 50).
type Queue struct {
	runner  *Runner
	jobs    chan queueJob
	sem     chan struct{} // counting semaphore
	once    sync.Once
}

type queueJob struct {
	conn       models.DBConnection
	scheduleID *int
}

// NewQueue creates and starts a backup queue backed by the given runner.
func NewQueue(runner *Runner) *Queue {
	q := &Queue{
		runner: runner,
		jobs:   make(chan queueJob, 50),
		sem:    make(chan struct{}, maxConcurrentBackups),
	}
	q.start()
	return q
}

func (q *Queue) start() {
	go func() {
		for job := range q.jobs {
			q.sem <- struct{}{} // acquire slot (blocks when 5 are running)
			go func(j queueJob) {
				defer func() { <-q.sem }() // release slot when done
				q.runner.RunBackup(j.conn, j.scheduleID)
			}(job)
		}
	}()
}

// Enqueue adds a backup job to the queue.
// Returns false if the queue is full (50 pending jobs).
func (q *Queue) Enqueue(conn models.DBConnection, scheduleID *int) bool {
	select {
	case q.jobs <- queueJob{conn: conn, scheduleID: scheduleID}:
		log.Printf("[queue] enqueued backup for connection %d (%s)", conn.ID, conn.Name)
		return true
	default:
		log.Printf("[queue] queue full — dropping backup for connection %d", conn.ID)
		return false
	}
}
