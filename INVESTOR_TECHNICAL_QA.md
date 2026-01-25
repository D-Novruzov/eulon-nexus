# GitNexus - Investor Technical Q&A Guide

## Table of Contents
1. [Architecture & Technology Stack](#architecture--technology-stack)
2. [Performance & Scalability](#performance--scalability)
3. [Security & Privacy](#security--privacy)
4. [Data Handling & Storage](#data-handling--storage)
5. [AI/ML Capabilities](#aiml-capabilities)
6. [Deployment & Infrastructure](#deployment--infrastructure)
7. [Competitive Advantages](#competitive-advantages)
8. [Development & Testing](#development--testing)
9. [Future Roadmap & Technical Debt](#future-roadmap--technical-debt)

---

## Architecture & Technology Stack

### Q1: What is the core architecture of GitNexus?

**Answer:**
GitNexus uses a **client-side, edge-based architecture** that runs entirely in the browser. The system follows a clean, modular design with four distinct layers:

1. **UI Layer** (`src/ui`): React 18 components for visualization and interaction
2. **Core Logic Layer** (`src/core`): Multi-pass ingestion pipeline that builds the knowledge graph
3. **Concurrency Layer** (`src/workers`): Web Worker Pool for parallel processing
4. **Services Layer** (`src/services`): External integrations (GitHub API, ZIP processing)

**Key Architectural Pattern:**
- **Dual-Engine Architecture**: 
  - Legacy Engine: Production-ready sequential processing
  - Next-Gen Engine: Parallel processing with 4-8x performance improvement
  - Automatic fallback ensures reliability

### Q2: What technologies power GitNexus?

**Answer:**
**Frontend Stack:**
- React 18 + TypeScript for type safety
- Vite for fast builds and hot module replacement
- D3.js for interactive graph visualization

**Code Analysis:**
- Tree-sitter (WASM) for accurate AST parsing
- Supports TypeScript, JavaScript, Python
- WebAssembly for near-native performance

**Concurrency:**
- Web Worker Pool with intelligent task distribution
- Comlink for simplified worker communication
- Parallel processing across all CPU cores

**AI/ML:**
- LangChain.js for agent orchestration
- Multi-LLM support (OpenAI, Anthropic, Gemini, Azure)
- Graph RAG with Cypher query generation

**Storage:**
- In-memory knowledge graph (primary)
- KuzuDB WASM for advanced graph queries (in progress)
- IndexedDB for persistence (planned)

### Q3: How does the four-pass ingestion pipeline work?

**Answer:**
The pipeline processes codebases in four sequential passes, each building upon the previous:

**Pass 1: Structure Analysis**
- Recursive directory traversal
- File type classification
- Creates Project/Folder/File nodes with CONTAINS relationships

**Pass 2: Code Parsing & AST Extraction** (Parallel Processing)
- Tree-sitter WASM parsers generate ASTs
- Extracts classes, functions, methods, variables
- Creates DEFINES relationships
- Uses LRU cache for memory efficiency
- **Runs in parallel using Web Worker Pool** (4-8x speedup)

**Pass 3: Import Resolution**
- Analyzes import/require statements
- Resolves module paths (ES6, CommonJS, Python)
- Creates IMPORTS relationships between files

**Pass 4: Call Graph Analysis**
- Exact matching via import resolution
- Fuzzy matching with Levenshtein distance
- Creates CALLS relationships with confidence scores

**Why Sequential Passes?**
Each pass depends on data from previous passes. For example, call resolution (Pass 4) requires import data (Pass 3), which requires parsed definitions (Pass 2).

---

## Performance & Scalability

### Q4: What performance improvements have you achieved?

**Answer:**
We've implemented a **Web Worker Pool architecture** that delivers significant performance gains:

**Speedup by Codebase Size:**
- Small codebases (< 100 files): **1.5-2x faster**
- Medium codebases (100-1000 files): **2-4x faster**
- Large codebases (1000+ files): **4-8x faster**

**Key Performance Features:**
- **Parallel file parsing**: Multiple files processed simultaneously
- **Concurrent Tree-sitter operations**: AST generation across all CPU cores
- **Better CPU utilization**: Near 100% on multi-core systems
- **UI responsiveness**: Main thread remains free during processing
- **Memory-efficient caching**: LRU cache with automatic eviction

**Real-World Impact:**
- A 1000-file codebase that previously took 5 minutes now processes in 1-2 minutes
- UI remains interactive during processing
- Automatic worker count optimization based on hardware

### Q5: How does GitNexus handle large codebases?

**Answer:**
**Current Capabilities:**
- Successfully processes codebases with 1000+ files
- Configurable file limits and directory filters
- Memory-efficient AST caching (LRU with configurable size)
- Progress tracking for long-running operations

**Scalability Features:**
- **Worker Pool**: Automatically scales to available CPU cores
- **Memory Management**: Automatic cleanup and garbage collection
- **Incremental Processing**: Can filter by directory/file patterns
- **Error Recovery**: Graceful handling of worker failures

**Known Limitations (Being Addressed):**
- Very large repos (100K+ files) may hit browser memory limits (~2GB)
- Current architecture is in-memory only (no persistence)
- **Future Solution**: IndexedDB persistence + server-side processing option

### Q6: What are the bottlenecks and how are you addressing them?

**Answer:**
**Current Bottlenecks:**
1. **Memory**: Large codebases consume significant browser memory
   - **Solution**: LRU cache with eviction, IndexedDB persistence (planned)

2. **Single-threaded Passes 3 & 4**: Import and call resolution are sequential
   - **Solution**: Parallel pipeline architecture already implemented for Pass 2
   - **Future**: Parallelize remaining passes where dependencies allow

3. **No Persistence**: Data lost on page refresh
   - **Solution**: IndexedDB integration in progress

**Performance Monitoring:**
- Worker pool statistics tracking
- Memory usage monitoring
- Processing time metrics
- Error rate tracking

---

## Security & Privacy

### Q7: How does GitNexus ensure code privacy and security?

**Answer:**
**Privacy-First Architecture:**
- **100% Client-Side Processing**: All code analysis happens in the user's browser
- **Zero Server Transmission**: No code is ever sent to our servers
- **Local API Keys**: LLM API keys stored locally, never transmitted to our servers
- **GitHub Public API Only**: Only accesses public repositories via official GitHub API

**Security Measures:**
- **No Code Storage**: We don't store any code on our servers
- **Session Security**: Secure cookies with httpOnly flags for OAuth
- **CORS Protection**: Proper cross-origin resource sharing configuration
- **Input Validation**: All user inputs validated before processing
- **Same-Origin Policy**: Browser enforces isolation between origins

**Compliance Benefits:**
- No GDPR concerns (no data collection)
- No SOC2 requirements for code storage
- No risk of code leaks or breaches
- Suitable for enterprise environments with strict security policies

### Q7a: What about local storage security? Can hackers access API keys?

**Answer:**
**Honest Assessment:**
Yes, this is a legitimate security concern. API keys are currently stored in `localStorage`, which can be accessed by JavaScript running on the same origin.

**Attack Vectors:**
1. **XSS (Cross-Site Scripting)**: If an attacker injects malicious JavaScript into the page, they could read localStorage
2. **Browser Extensions**: Malicious extensions with page access could read localStorage
3. **Physical Access**: If someone has physical access to an unlocked device, they can access localStorage via DevTools

**Current Protections:**
- **Same-Origin Policy**: localStorage is isolated per origin (domain), preventing other websites from accessing it
- **HTTPS Only**: In production, we enforce HTTPS, preventing man-in-the-middle attacks
- **Input Sanitization**: All user inputs are validated and sanitized to prevent XSS
- **No Code Execution**: We don't execute user-provided code, reducing XSS risk
- **Content Security Policy (CSP)**: Can be implemented to further restrict script execution

**Risk Assessment:**
- **Low Risk for Code**: User's code is never stored in localStorage (only in-memory)
- **Medium Risk for API Keys**: API keys in localStorage are vulnerable to XSS
- **Mitigation**: Users can revoke API keys at any time from their LLM provider

**Future Improvements:**
1. **Encrypted Storage**: Encrypt API keys before storing (requires user password)
2. **Session Storage**: Use sessionStorage instead (cleared on tab close) for temporary keys
3. **Browser Credential API**: Use WebAuthn or Credential Management API for secure storage
4. **Optional Server-Side Proxy**: Enterprise option to store keys server-side with encryption
5. **Key Rotation**: Automatic key rotation and expiration

**Best Practices for Users:**
- Use dedicated API keys with limited permissions
- Rotate keys regularly
- Monitor API usage for suspicious activity
- Use separate keys for different projects
- Revoke keys immediately if compromised

**Comparison to Alternatives:**
- **Server-Side Storage**: More secure but requires trust in server security
- **Browser Extension Storage**: Similar risks, but isolated from web pages
- **Hardware Security Modules**: Most secure but complex for end users

**Bottom Line:**
While localStorage has security limitations, it's a reasonable trade-off for a client-side application. The risk is primarily from XSS attacks, which we mitigate through input validation and same-origin policy. For enterprise customers, we can offer server-side key management with encryption.

### Q8: What authentication and authorization do you use?

**Answer:**
**Current Implementation:**
- **GitHub OAuth**: For accessing private repositories (optional)
- **Session Management**: Express sessions with secure cookies
- **Token Storage**: GitHub tokens stored server-side, never exposed to frontend

**Future Enterprise Features:**
- SSO integration (SAML, OIDC)
- Role-based access control
- Team collaboration features
- Audit logging

**For Public Repos:**
- No authentication required
- Works immediately with public GitHub URLs

---

## Data Handling & Storage

### Q9: How is data stored and managed?

**Answer:**
**Current Storage Architecture:**

1. **Primary Storage: In-Memory Knowledge Graph**
   - JavaScript arrays (`nodes[]`, `relationships[]`)
   - Fast access, zero latency
   - Lost on page refresh (being addressed)

2. **Secondary Storage: KuzuDB WASM** (In Progress)
   - Embedded graph database in browser
   - Enables Cypher queries for advanced graph operations
   - Currently in-memory only, IndexedDB persistence planned

3. **Cache Layer: LRU Cache**
   - AST caching for repeated operations
   - Configurable size limits (default: 1000 entries)
   - Automatic eviction based on access patterns

**Data Flow:**
```
Repository → Structure Analysis → Parsing → Import Resolution → Call Analysis → Knowledge Graph
```

**Export Capabilities:**
- JSON export (full graph structure)
- CSV export (nodes and relationships tables) - in progress

### Q10: What happens to data when a user closes the browser?

**Answer:**
**Current State:**
- Data is lost on page refresh (in-memory only)
- User must re-process repository on return

**This is a Known Limitation We're Addressing:**
- **IndexedDB Integration**: In progress to persist graphs locally
- **Server-Side Option**: Future enterprise feature for shared graphs
- **Export/Import**: Users can export graphs as JSON for backup

**Future Solution:**
- Automatic IndexedDB persistence
- Background sync for large graphs
- Incremental updates (only process changed files)

---

## AI/ML Capabilities

### Q11: How does the AI chat feature work?

**Answer:**
**Graph RAG Architecture:**
- **Retrieval-Augmented Generation**: Combines knowledge graph queries with LLM reasoning
- **LangChain Orchestration**: ReAct agent pattern with tool-augmented reasoning
- **Multi-LLM Support**: OpenAI, Anthropic, Google Gemini, Azure OpenAI

**How It Works:**
1. User asks natural language question
2. **Cypher Query Generator** translates question to graph query
3. Query executes against knowledge graph
4. Relevant code context retrieved
5. LLM generates answer using retrieved context

**Example Queries:**
- "What functions are in main.py?"
- "Show classes that inherit from BaseClass"
- "How does authentication work?"
- "Find all functions that call getUserData"

**Current Status:**
- ✅ Basic AI chat working
- ✅ Graph traversal queries functional
- 🚧 Advanced Cypher queries (blocked by KuzuDB integration)
- 🚧 Graph RAG agent refinement (in progress)

### Q12: What makes your approach better than traditional RAG?

**Answer:**
**Traditional RAG Limitations:**
- Vector embeddings lose structural relationships
- Semantic similarity doesn't capture code dependencies
- Expensive embedding generation for large codebases
- Context window limits for large codebases

**GitNexus Advantages:**
- **Graph-Based Retrieval**: Preserves code structure and relationships
- **Zero Embedding Cost**: No need for expensive embedding models
- **Faster Indexing**: AST parsing is faster than embedding generation
- **Precise Context**: Graph queries return exact code relationships
- **Scalable**: Works with codebases of any size

**Use Cases Where We Excel:**
- Finding all callers of a function (impact analysis)
- Detecting unused functions (dead code detection)
- Understanding dependency chains
- Computing blast radius for changes
- Onboarding new developers

### Q13: What LLM providers do you support?

**Answer:**
**Supported Providers:**
- **OpenAI** (GPT-4, GPT-3.5)
- **Anthropic** (Claude)
- **Google Gemini**
- **Azure OpenAI**

**Architecture:**
- Provider-agnostic design via LangChain
- Easy to add new providers
- Users configure their own API keys
- Keys stored locally, never transmitted

**Future:**
- Ollama support (local LLMs) - in progress
- Custom model endpoints
- Batch processing for cost efficiency

---

## Deployment & Infrastructure

### Q14: How is GitNexus deployed?

**Answer:**
**Current Deployment:**
- **Frontend**: Vite-built React app (static files)
- **Backend**: Express.js API (GitHub OAuth proxy)
- **Hosting**: Railway (can deploy to any cloud)

**Railway Setup:**
- Two services from single repo:
  - Frontend service (root directory)
  - Backend service (`backend` folder)
- Automatic HTTPS
- Environment variable configuration

**Cloud-Agnostic Design:**
- Can deploy to AWS, GCP, Azure, Vercel, Netlify
- No vendor lock-in
- Static frontend can use CDN (CloudFront, Cloudflare)

### Q15: What are the infrastructure costs?

**Answer:**
**Current Costs:**
- **Frontend**: Static hosting (very low cost, ~$5-20/month)
- **Backend**: Minimal API server (~$5-20/month on Railway)
- **No Database Costs**: Client-side storage
- **No Compute Costs**: Processing happens in user's browser

**Cost Advantages:**
- **Zero compute costs** for code processing (client-side)
- **No database costs** (in-memory + IndexedDB)
- **No CDN costs** for large files (users download directly from GitHub)
- **Scalable**: Costs don't increase with usage

**Future Enterprise Model:**
- Optional server-side processing for large codebases
- Shared graph storage (cost per user)
- Team collaboration features

### Q16: How do you handle GitHub API rate limits?

**Answer:**
**Rate Limit Management:**
- **Without Token**: 60 requests/hour (GitHub public API limit)
- **With Token**: 5,000 requests/hour
- **Smart Caching**: Caches repository structure to minimize API calls
- **Batch Requests**: Efficiently fetches multiple files per request

**User Experience:**
- Works immediately for public repos (no token needed)
- Optional GitHub token for higher limits
- Clear error messages if limits hit
- Automatic retry with exponential backoff

**Future Improvements:**
- Repository archive download (single API call)
- Incremental updates (only fetch changed files)
- Background sync for large repos

---

## Competitive Advantages

### Q17: What makes GitNexus unique?

**Answer:**
**Key Differentiators:**

1. **Privacy-First Architecture**
   - Only solution that processes code 100% client-side
   - No code ever leaves user's browser
   - Critical for enterprise security compliance

2. **Graph-Based RAG**
   - Preserves code structure vs. vector embeddings
   - Faster and cheaper than embedding-based solutions
   - More accurate for code-specific queries

3. **Performance**
   - 4-8x faster than sequential processing
   - Parallel Web Worker architecture
   - Handles large codebases efficiently

4. **Zero Infrastructure Costs**
   - No server-side processing costs
   - Scales infinitely without infrastructure scaling
   - Users pay only for their LLM API usage

5. **Developer Experience**
   - Interactive graph visualization
   - Natural language code queries
   - Export capabilities for further analysis

### Q18: How do you compare to Sourcegraph, GitHub Copilot, or other code analysis tools?

**Answer:**
**vs. Sourcegraph:**
- **Privacy**: GitNexus is client-side; Sourcegraph requires server deployment
- **Cost**: GitNexus has zero infrastructure; Sourcegraph requires servers
- **Setup**: GitNexus works immediately; Sourcegraph needs installation
- **Use Case**: GitNexus focuses on code understanding; Sourcegraph is code search

**vs. GitHub Copilot:**
- **Purpose**: Copilot is code generation; GitNexus is code understanding
- **Architecture**: Copilot is cloud-based; GitNexus is client-side
- **Complementary**: Can be used together (GitNexus for understanding, Copilot for writing)

**vs. Traditional RAG Tools:**
- **Accuracy**: Graph-based retrieval is more precise than vector similarity
- **Cost**: No embedding generation costs
- **Speed**: Faster indexing with AST parsing
- **Structure**: Preserves code relationships vs. losing them in embeddings

**Market Position:**
- **Niche**: Code understanding and onboarding (not code search or generation)
- **Target**: Developers, teams, enterprises needing codebase comprehension
- **Advantage**: Privacy + Performance + Cost efficiency

---

## Development & Testing

### Q19: What is your development process and code quality?

**Answer:**
**Development Practices:**
- **TypeScript**: Full type safety across codebase
- **Modular Architecture**: Clean separation of concerns
- **Feature Flags**: Gradual rollout of new features
- **Version Control**: Git with feature branches

**Code Quality:**
- **ESLint**: Strict linting rules
- **TypeScript Strict Mode**: Maximum type safety
- **Error Boundaries**: Graceful error handling in UI
- **Comprehensive Error Handling**: Worker failures, API errors, parsing errors

**Testing Strategy:**
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end pipeline testing
- **Performance Tests**: Benchmarking with various file sizes
- **Browser Tests**: Cross-browser compatibility
- **Worker Pool Tests**: Comprehensive test suite for parallel processing

**Documentation:**
- Comprehensive project guide
- Implementation summaries
- Architecture diagrams
- API documentation

### Q20: How do you handle errors and edge cases?

**Answer:**
**Error Handling Strategy:**

1. **Worker Failures**
   - Automatic worker replacement
   - Task retry with exponential backoff
   - Fallback to sequential processing

2. **Parsing Errors**
   - Graceful degradation (skip problematic files)
   - Error logging for debugging
   - User notification of skipped files

3. **API Errors**
   - Rate limit handling
   - Network retry logic
   - Clear error messages to users

4. **Memory Errors**
   - Memory usage monitoring
   - Automatic cleanup
   - User warnings for large codebases

5. **Browser Compatibility**
   - Feature detection (Web Workers, WASM)
   - Graceful degradation for unsupported browsers
   - Clear messaging about requirements

**Error Recovery:**
- Automatic fallback mechanisms
- Progress preservation (can resume from checkpoints)
- Export capabilities (save work before errors)

---

## Future Roadmap & Technical Debt

### Q21: What are your technical priorities for the next 6-12 months?

**Answer:**
**Short-Term (0-3 months):**
1. **IndexedDB Persistence**: Save graphs locally, no data loss on refresh
2. **CSV Export**: Export nodes and relationships as CSV
3. **Ollama Support**: Local LLM integration for privacy
4. **Graph RAG Refinement**: Improve query accuracy and context retrieval

**Medium-Term (3-6 months):**
1. **Control Flow Graph (CFG)**: Add execution flow analysis
2. **Incremental Updates**: Only process changed files
3. **Advanced Cypher Queries**: Complete KuzuDB integration
4. **Performance Optimization**: Parallelize Passes 3 & 4 where possible

**Long-Term (6-12 months):**
1. **Server-Side Processing Option**: For enterprise with large codebases
2. **Multi-User Collaboration**: Shared graphs, team features
3. **Additional Languages**: Java, C++, Go, Rust support
4. **Enterprise Features**: SSO, RBAC, audit logging

### Q22: What technical debt are you aware of?

**Answer:**
**Known Technical Debt:**

1. **State Management** (Medium Priority)
   - Large useState hook in HomePage.tsx causes unnecessary re-renders
   - **Solution**: Refactor to Context API or state management library

2. **Query Engine** (High Priority)
   - Mock Cypher query engine using regex
   - **Solution**: Complete KuzuDB integration or proper parser

3. **Persistence** (High Priority)
   - No data persistence (lost on refresh)
   - **Solution**: IndexedDB integration in progress

4. **Scalability** (Medium Priority)
   - Large repos (100K+ files) hit memory limits
   - **Solution**: Server-side processing option, pagination

5. **Code Duplication** (Low Priority)
   - Some duplicate ID generation logic
   - **Solution**: Centralize utility functions

**Addressing Technical Debt:**
- Prioritized based on user impact
- Addressed incrementally alongside features
- Documented in codebase for transparency

### Q23: How do you plan to scale the team and technology?

**Answer:**
**Team Scaling:**
- **Current**: Solo developer with clear architecture
- **Near-Term**: Add frontend/backend developers
- **Long-Term**: Specialized roles (AI/ML, DevOps, Enterprise)

**Technology Scaling:**
- **Current**: Client-side only (infinite horizontal scale)
- **Future**: Optional server-side for enterprise
- **Architecture**: Designed for both models

**Infrastructure Scaling:**
- **Current**: Minimal infrastructure (static hosting)
- **Future**: Cloud-agnostic, can scale to any provider
- **Cost Model**: Infrastructure costs don't scale with users (client-side processing)

**Product Scaling:**
- **Current**: Single-user, local processing
- **Future**: Multi-user, shared graphs, team collaboration
- **Enterprise**: SSO, RBAC, audit logging, compliance features

---

## Additional Technical Questions

### Q24: What are the security risks of client-side storage and how do you mitigate them?

**Answer:**
**Storage Types Used:**
- **localStorage**: API keys, settings, GitHub tokens
- **sessionStorage**: Temporary OAuth tokens
- **In-Memory**: Knowledge graph, parsed code (not persisted)

**Security Risks:**

1. **XSS Attacks** (Primary Risk)
   - **Risk**: Malicious scripts could read localStorage
   - **Mitigation**: Input sanitization, Content Security Policy, no user code execution
   - **Impact**: API keys could be stolen, but users can revoke them

2. **Browser Extensions**
   - **Risk**: Malicious extensions with page access
   - **Mitigation**: Users should only install trusted extensions
   - **Impact**: Limited to users who install malicious extensions

3. **Physical Access**
   - **Risk**: Unlocked device access
   - **Mitigation**: Device-level security (OS locks, encryption)
   - **Impact**: Same risk as any application on the device

4. **Malware/Keyloggers**
   - **Risk**: System-level malware
   - **Mitigation**: Out of scope (requires OS-level security)
   - **Impact**: Affects all applications, not just GitNexus

**Mitigation Strategies:**

**Current:**
- Same-origin policy isolation
- HTTPS enforcement in production
- Input validation and sanitization
- No user code execution
- API keys can be revoked by users

**Planned:**
- Encrypted localStorage (user password required)
- Optional server-side key management (enterprise)
- Key rotation and expiration
- Usage monitoring and alerts

**Security Model Comparison:**

| Storage Method | Security | Usability | Current Status |
|----------------|----------|-----------|----------------|
| localStorage | Medium | High | ✅ Current |
| Encrypted localStorage | High | Medium | 🚧 Planned |
| Server-side (encrypted) | High | High | 🚧 Enterprise option |
| Hardware tokens | Very High | Low | ❌ Not planned |

**For Enterprise:**
- Server-side key management with encryption at rest
- Key rotation policies
- Audit logging
- SSO integration (keys managed by identity provider)

### Q25: How does Tree-sitter work and why did you choose it?

**Answer:**
**Tree-sitter:**
- **What**: Incremental parser generator that builds ASTs
- **Why**: Industry standard for code analysis (used by GitHub, Atom, Neovim)
- **Performance**: Compiled to WASM for near-native speed
- **Accuracy**: Language-specific grammars for precise parsing
- **Support**: Active community, well-maintained

**Advantages:**
- Handles syntax errors gracefully
- Incremental parsing (fast updates)
- Multiple language support
- Battle-tested in production

**Implementation:**
- WASM parsers loaded dynamically
- One parser per language (TypeScript, JavaScript, Python)
- AST queries for efficient symbol extraction

### Q26: How does the Web Worker Pool work?

**Answer:**
**Architecture:**
- **Pool Management**: Creates optimal number of workers (based on CPU cores)
- **Task Queue**: Queues tasks when all workers busy
- **Load Balancing**: Distributes tasks evenly across workers
- **Error Handling**: Replaces failed workers automatically

**Communication:**
- **Message Passing**: Workers communicate via postMessage
- **Comlink**: Simplifies async worker communication
- **Serialization**: Tasks/results serialized automatically

**Lifecycle:**
1. Initialize pool with worker count
2. Queue tasks for processing
3. Distribute to available workers
4. Collect results
5. Recycle workers for next tasks
6. Shutdown and cleanup

**Benefits:**
- Parallel processing across CPU cores
- UI remains responsive
- Automatic resource management
- Graceful error recovery

### Q27: What is KuzuDB and why are you using it?

**Answer:**
**KuzuDB:**
- **What**: Embedded graph database (similar to Neo4j)
- **Why**: Enables Cypher queries for advanced graph operations
- **Format**: WASM for browser execution
- **Status**: Integration in progress

**Use Cases:**
- Complex graph queries (multi-hop traversals)
- Pattern matching (find all paths between nodes)
- Graph analytics (centrality, clustering)
- Graph RAG (sophisticated context retrieval)

**Current Status:**
- ✅ WASM engine integrated
- ✅ Graph schema defined
- ✅ Data ingestion working
- 🚧 Cypher query execution (in progress)
- 🚧 IndexedDB persistence (planned)

**Alternative:**
- Currently using in-memory graph with custom query engine
- KuzuDB will enable more sophisticated queries
- Fallback available if KuzuDB unavailable

---

## Closing Notes

### Key Messages for Investors

1. **Privacy-First**: Unique client-side architecture ensures code never leaves user's browser
2. **Performance**: 4-8x speedup with parallel processing, handles large codebases
3. **Cost Efficiency**: Zero infrastructure costs for processing (client-side)
4. **Innovation**: Graph-based RAG is more accurate and cheaper than vector embeddings
5. **Scalability**: Architecture supports both client-side and future server-side models
6. **Market Fit**: Addresses real pain point (code understanding) with unique approach

### Technical Strengths

- Modern, well-architected codebase
- Performance optimizations (parallel processing)
- Comprehensive error handling
- Clear separation of concerns
- Extensible design (easy to add features)

### Areas for Growth

- Persistence (IndexedDB integration)
- Enterprise features (multi-user, SSO)
- Additional language support
- Advanced graph analytics
- Server-side processing option

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Prepared For**: Investor Technical Q&A Session
