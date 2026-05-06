# Minimal Roundtrips

**agent-kiki can process multiple files or run multiple safe commands in parallel, minimizing roundtrip and API costs.**

Standard agents are often "single-threaded." agent-kiki breaks this bottleneck by batching operations. Need to see the interface, implementation, and tests? agent-kiki reads them all at once. Need to install, build, and test? agent-kiki executes the sequence in one go.

![agent-kiki Models Demo](../assets/media/multi_function_read.png)
