# Minimal Roundtrips

**ailiance-agent can process multiple files or run multiple safe commands in parallel, minimizing roundtrip and API costs.**

Standard agents are often "single-threaded." ailiance-agent breaks this bottleneck by batching operations. Need to see the interface, implementation, and tests? ailiance-agent reads them all at once. Need to install, build, and test? ailiance-agent executes the sequence in one go.

![ailiance-agent Models Demo](../assets/media/multi_function_read.png)
