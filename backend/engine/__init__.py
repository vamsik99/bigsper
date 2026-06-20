"""
Engine modules — implement the BigSper loop:

  diagnose   — assess learner knowledge against the concept graph
  heatmap    — compute gap scores per concept-graph node
  teach      — RAG-grounded lesson generation + preference adaptation
  verify     — delegate to course.get_active().verifier.verify(task, answer)
  report     — aggregate cohort data for the faculty dashboard

Rules:
  - All modules get the current course via course.get_active().
  - Never import from courses/ or hard-code any subject name.
  - Never call llm.chat() to produce a "verified" score or badge.
"""
