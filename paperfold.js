// --- Paperfold.js Framework Core ---

/**
 * The base Component class for Paperfold.js.
 * Components manage their own state and render their UI.
 */
class Component {
    /**
     * Creates an instance of Component.
     * @param {object} props - Properties passed to the component from its parent.
     */
    constructor(props = {}) {
        this.props = props;
        this.state = {};
        this.element = null;
        this._isMounted = false;
        this.setState = this.setState.bind(this);
        this.blockElements = new Map(); // To store references to block DOM elements
    }

    /**
     * Updates the component's state and triggers a re-render if the component is mounted.
     * @param {object|function} updater - An object containing the new state to merge, or a function that receives the previous state and returns the new state.
     */
    setState(updater) {
        let newState = typeof updater === 'function' ? updater(this.state) : updater;
        this.state = { ...this.state, ...newState };
        if (this._isMounted) {
            this._updateComponent();
        }
    }

    /**
     * Renders the component's UI. Subclasses MUST override this.
     * @returns {HTMLElement} The root DOM element for this component.
     */
    render() {
        throw new Error("Component must implement a render() method.");
    }

    /**
     * Called when the component is first mounted to the DOM.
     * @returns {HTMLElement} The initial DOM element of the component.
     */
    _mount() {
        this.element = this.render();
        this._isMounted = true;
        if (typeof this.componentDidMount === 'function') {
            this.componentDidMount();
        }
        return this.element;
    }

    /**
     * Re-renders the component and updates the DOM.
     */
    _updateComponent() {
        const oldElement = this.element;
        const parentNode = oldElement && oldElement.parentNode;
        const newElement = this.render();

        if (oldElement && parentNode) {
            try {
                if (parentNode.contains(oldElement)) {
                    parentNode.removeChild(oldElement);
                }
                parentNode.appendChild(newElement);
            } catch (e) {
                // Error handling removed for simplification
            }
        } else {
            if (this._isMounted && this.rootElement) {
                 this.rootElement.innerHTML = '';
                 this.rootElement.appendChild(newElement);
            }
        }
        this.element = newElement;
        if (typeof this.componentDidUpdate === 'function') {
            this.componentDidUpdate();
        }
    }

    /**
     * Updates the visual position of a block's DOM element using CSS transform.
     * @param {string} blockId - The ID of the block.
     * @param {Block} blockData - The Block object with updated position.
     */
    updateBlockVisuals(blockId, blockData) {
        const element = this.blockElements.get(blockId);
        if (element) {
            let visualX = blockData.x;
            let visualY = blockData.y;
            if (blockData.shape === 'circle') {
                visualX = blockData.x - blockData.radiusX;
                visualY = blockData.y - blockData.radiusY;
            }
            element.style.transform = `translate(${visualX}px, ${visualY}px)`;
        }
    }
}

/**
 * The main Paperfold.js application initializer.
 */
class PaperfoldApp {
    constructor(RootComponent, rootElement) {
        this.rootComponent = new RootComponent();
        this.rootElement = rootElement;
        this.rootComponent.rootElement = rootElement;
        this._renderApp();
    }

    _renderApp() {
        this.rootElement.innerHTML = '';
        const mountedElement = this.rootComponent._mount();
        this.rootElement.appendChild(mountedElement);
    }
}

// --- Block Object Definition ---
class Block {
    constructor(options) {
        this.id = options.id || `block-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        this.shape = options.shape || 'square';
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.size = options.size || 50;
        this.scale_x = options.scale_x === undefined ? 0 : options.scale_x;
        this.scale_y = options.scale_y === undefined ? 0 : options.scale_y;
        this.borderWidth = options.borderWidth || 0;
        this.borderColor = options.borderColor || 'black';
        this.level = options.level || 0;
        this.opaque = options.opaque === undefined ? 100 : Math.max(0, Math.min(100, options.opaque));

        if (this.shape !== 'square' && this.shape !== 'circle') {
            this.shape = 'square';
        }
    }

    get actualWidth() {
        return this.shape === 'square' ? this.size * (1 + this.scale_x / 100) : 2 * this.size * (1 + this.scale_x / 100);
    }

    get actualHeight() {
        return this.shape === 'square' ? this.size * (1 + this.scale_y / 100) : 2 * this.size * (1 + this.scale_y / 100);
    }

    get radiusX() {
        return this.shape === 'circle' ? this.size * (1 + this.scale_x / 100) : 0;
    }

    get radiusY() {
        return this.shape === 'circle' ? this.size * (1 + this.scale_y / 100) : 0;
    }

    getBounds() {
        let minX, minY, maxX, maxY;
        if (this.shape === 'square') {
            minX = this.x; minY = this.y;
            maxX = this.x + this.actualWidth; maxY = this.y + this.actualHeight;
        } else if (this.shape === 'circle') {
            minX = this.x - this.radiusX; minY = this.y - this.radiusY;
            maxX = this.x + this.radiusX; maxY = this.y + this.radiusY;
        } else {
            minX = this.x; minY = this.y; maxX = this.x; maxY = this.y;
        }
        return { minX, minY, maxX, maxY };
    }

    moveTo(newX, newY) {
        this.x = newX; this.y = newY;
    }

    moveBy(deltaX, deltaY) {
        this.x += deltaX; this.y += deltaY;
    }

    resize(newSize) {
        if (typeof newSize === 'number' && newSize >= 0) {
            this.size = newSize;
        }
    }
}

// --- ANIMATION HELPERS ---
const activeBlockAnimations = new Map();

function positiveModulo(i, n) {
    return (i % n + n) % n;
}

/**
 * Initiates continuous movement for a block using direct DOM manipulation for visuals.
 * The owningComponent is expected to implement `updateBlockVisuals(blockId, blockData)`
 * to apply style changes (e.g., CSS transforms) to the block's DOM element.
 *
 * @param {Block} blockObject - The Block object to move.
 * @param {number} angle - The direction of movement in degrees (0-360).
 * @param {number} pps - Pixels per second to move.
 * @param {Component} owningComponent - The instance of the Component that owns this Block.
 * Must implement `updateBlockVisuals`.
 * @param {string} [boundary='pass'] - How the block behaves on collision with browser edges ('front', 'back', 'pass', 'bounce').
 * - 'front': Stops when its front part hits the browser wall.
 * - 'back': Stops when its back part hits/crosses the browser wall.
 * - 'pass': Passes through the browser wall, reappearing on the opposite side.
 * - 'bounce': Bounces in the opposite direction when hitting the browser wall.
 * @param {string} [collision='pass'] - How the block behaves on collision with other blocks ('stop', 'bounce', 'pass').
 * - 'stop': Both colliding blocks stop.
 * - 'bounce': Both colliding blocks bounce off each other.
 * - 'pass': Blocks pass through each other without interaction.
 * @param {number} [duration=0] - Optional: Duration in milliseconds.
 * @param {Array<Block>} [allBlocks=[]] - An array of all blocks in the scene for inter-block collision detection.
 */
function moveBlock(blockObject, angle, pps, owningComponent, boundary = 'pass', collision = 'pass', duration = 0, allBlocks = []) {
    if (!owningComponent || typeof owningComponent.updateBlockVisuals !== 'function') {
        console.error("moveBlock: owningComponent is invalid or does not implement updateBlockVisuals(blockId, blockData).");
        return;
    }
    if (!(blockObject instanceof Block)) {
        console.error("moveBlock: Invalid blockObject provided. Must be an instance of Block.");
        return;
    }
    if (typeof angle !== 'number' || typeof pps !== 'number') {
        console.error("moveBlock: Invalid angle or pps (pixels per second).");
        return;
    }
    if (!['front', 'back', 'pass', 'bounce'].includes(boundary)) {
        boundary = 'pass';
    }
    if (!['stop', 'bounce', 'pass'].includes(collision)) {
        collision = 'pass';
    }

    const blockId = blockObject.id;

    if (activeBlockAnimations.has(blockId)) {
        cancelAnimationFrame(activeBlockAnimations.get(blockId).animationFrameId);
    }

    let currentSpeedX = Math.cos(angle * Math.PI / 180) * pps;
    let currentSpeedY = Math.sin(angle * Math.PI / 180) * pps;

    let lastTime = performance.now();
    let screenWidth = window.innerWidth;
    let screenHeight = window.innerHeight;

    const animate = (currentTime) => {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        const blockToMove = blockObject;
        
        const calculatedDeltaX = currentSpeedX * deltaTime;
        const calculatedDeltaY = currentSpeedY * deltaTime;

        blockToMove.x += calculatedDeltaX;
        blockToMove.y += calculatedDeltaY;

        let stopAnimation = false;

        // Boundary collision logic
        if (boundary === 'front') {
            if (blockToMove.shape === 'square') {
                if (currentSpeedX > 0 && blockToMove.x + blockToMove.actualWidth >= screenWidth) {
                    blockToMove.x = screenWidth - blockToMove.actualWidth; stopAnimation = true;
                } else if (currentSpeedX < 0 && blockToMove.x <= 0) {
                    blockToMove.x = 0; stopAnimation = true;
                }
                if (currentSpeedY > 0 && blockToMove.y + blockToMove.actualHeight >= screenHeight) {
                    blockToMove.y = screenHeight - blockToMove.actualHeight; stopAnimation = true;
                } else if (currentSpeedY < 0 && blockToMove.y <= 0) {
                    blockToMove.y = 0; stopAnimation = true;
                }
            } else if (blockToMove.shape === 'circle') {
                if (currentSpeedX > 0 && blockToMove.x + blockToMove.radiusX >= screenWidth) {
                    blockToMove.x = screenWidth - blockToMove.radiusX; stopAnimation = true;
                } else if (currentSpeedX < 0 && blockToMove.x - blockToMove.radiusX <= 0) {
                    blockToMove.x = blockToMove.radiusX; stopAnimation = true;
                }
                if (currentSpeedY > 0 && blockToMove.y + blockToMove.radiusY >= screenHeight) {
                    blockToMove.y = screenHeight - blockToMove.radiusY; stopAnimation = true;
                } else if (currentSpeedY < 0 && blockToMove.y - blockToMove.radiusY <= 0) {
                    blockToMove.y = blockToMove.radiusY; stopAnimation = true;
                }
            }
        } else if (boundary === 'back') {
            if (blockToMove.shape === 'square') {
                if (currentSpeedX > 0 && blockToMove.x >= screenWidth) { // Trailing edge (left side) crosses right boundary
                    blockToMove.x = screenWidth; stopAnimation = true;
                } else if (currentSpeedX < 0 && blockToMove.x + blockToMove.actualWidth <= 0) { // Trailing edge (right side) crosses left boundary
                    blockToMove.x = -blockToMove.actualWidth; stopAnimation = true;
                }
                if (currentSpeedY > 0 && blockToMove.y >= screenHeight) { // Trailing edge (top side) crosses bottom boundary
                    blockToMove.y = screenHeight; stopAnimation = true;
                } else if (currentSpeedY < 0 && blockToMove.y + blockToMove.actualHeight <= 0) { // Trailing edge (bottom side) crosses top boundary
                    blockToMove.y = -blockToMove.actualHeight; stopAnimation = true;
                }
            } else if (blockToMove.shape === 'circle') {
                if (currentSpeedX > 0 && blockToMove.x - blockToMove.radiusX >= screenWidth) { // Trailing edge (left side) crosses right boundary
                    blockToMove.x = screenWidth + blockToMove.radiusX; stopAnimation = true;
                } else if (currentSpeedX < 0 && blockToMove.x + blockToMove.radiusX <= 0) { // Trailing edge (right side) crosses left boundary
                    blockToMove.x = -blockToMove.radiusX; stopAnimation = true;
                }
                if (currentSpeedY > 0 && blockToMove.y - blockToMove.radiusY >= screenHeight) { // Trailing edge (top side) crosses bottom boundary
                    blockToMove.y = screenHeight + blockToMove.radiusY; stopAnimation = true;
                } else if (currentSpeedY < 0 && blockToMove.y + blockToMove.radiusY <= 0) { // Trailing edge (bottom side) crosses top boundary
                    blockToMove.y = -blockToMove.radiusY; stopAnimation = true;
                }
            }
        }
        else if (boundary === 'bounce') {
            let bounced = false;
            if (blockToMove.shape === 'square') {
                if (blockToMove.x <= 0) {
                    blockToMove.x = 0;
                    currentSpeedX *= -1;
                    bounced = true;
                } else if (blockToMove.x + blockToMove.actualWidth >= screenWidth) {
                    blockToMove.x = screenWidth - blockToMove.actualWidth;
                    currentSpeedX *= -1;
                    bounced = true;
                }
                if (blockToMove.y <= 0) {
                    blockToMove.y = 0;
                    currentSpeedY *= -1;
                    bounced = true;
                } else if (blockToMove.y + blockToMove.actualHeight >= screenHeight) {
                    blockToMove.y = screenHeight - blockToMove.actualHeight;
                    currentSpeedY *= -1;
                    bounced = true;
                }
            } else if (blockToMove.shape === 'circle') {
                if (blockToMove.x - blockToMove.radiusX <= 0) {
                    blockToMove.x = blockToMove.radiusX;
                    currentSpeedX *= -1;
                    bounced = true;
                } else if (blockToMove.x + blockToMove.radiusX >= screenWidth) {
                    blockToMove.x = screenWidth - blockToMove.radiusX;
                    currentSpeedX *= -1;
                    bounced = true;
                }
                if (blockToMove.y - blockToMove.radiusY <= 0) {
                    blockToMove.y = blockToMove.radiusY;
                    currentSpeedY *= -1;
                    bounced = true;
                } else if (blockToMove.y + blockToMove.radiusY >= screenHeight) {
                    blockToMove.y = screenHeight - blockToMove.radiusY;
                    currentSpeedY *= -1;
                    bounced = true;
                }
            }

            if (bounced) {
                animationData.angle = Math.atan2(currentSpeedY, currentSpeedX) * 180 / Math.PI;
                animationData.currentSpeedX = currentSpeedX;
                animationData.currentSpeedY = currentSpeedY;
            }
        } else { // 'pass' behavior
            if (blockToMove.shape === 'square') {
                const worldWidth = screenWidth + blockToMove.actualWidth;
                const worldHeight = screenHeight + blockToMove.actualHeight;
                blockToMove.x = positiveModulo(blockToMove.x + blockToMove.actualWidth, worldWidth) - blockToMove.actualWidth;
                blockToMove.y = positiveModulo(blockToMove.y + blockToMove.actualHeight, worldHeight) - blockToMove.actualHeight;
            } else if (blockToMove.shape === 'circle') {
                const worldWidth = screenWidth + 2 * blockToMove.radiusX;
                const worldHeight = screenHeight + 2 * blockToMove.radiusY;
                blockToMove.x = positiveModulo(blockToMove.x + blockToMove.radiusX, worldWidth) - blockToMove.radiusX;
                blockToMove.y = positiveModulo(blockToMove.y + blockToMove.radiusY, worldHeight) - blockToMove.radiusY;
            }
        }

        // Inter-block collision logic
        if (collision !== 'pass') { // Only perform collision checks if not 'pass'
            for (const otherBlock of allBlocks) {
                if (blockToMove.id === otherBlock.id) continue; // Don't collide with self

                // Only handle circle-circle collision for now
                if (blockToMove.shape === 'circle' && otherBlock.shape === 'circle') {
                    const dx = otherBlock.x - blockToMove.x;
                    const dy = otherBlock.y - blockToMove.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const minDistance = blockToMove.radiusX + otherBlock.radiusX;

                    if (distance < minDistance) {
                        // Collision detected
                        const blockToMoveAnimData = activeBlockAnimations.get(blockToMove.id);
                        const otherBlockAnimData = activeBlockAnimations.get(otherBlock.id);

                        if (!blockToMoveAnimData || !otherBlockAnimData) continue; // Ensure animation data exists

                        if (collision === 'stop') {
                            // Stop both blocks
                            blockToMoveAnimData.currentSpeedX = 0;
                            blockToMoveAnimData.currentSpeedY = 0;
                            otherBlockAnimData.currentSpeedX = 0;
                            otherBlockAnimData.currentSpeedY = 0;

                            // Separate the blocks to prevent sticking
                            const overlap = minDistance - distance;
                            const separationX = overlap * (dx / distance);
                            const separationY = overlap * (dy / distance);

                            blockToMove.x -= separationX * 0.5;
                            blockToMove.y -= separationY * 0.5;
                            otherBlock.x += separationX * 0.5;
                            otherBlock.y += separationY * 0.5;

                            // Update visuals for both blocks immediately
                            owningComponent.updateBlockVisuals(blockToMove.id, blockToMove);
                            owningComponent.updateBlockVisuals(otherBlock.id, otherBlock);

                            // Stop animation frames for both blocks
                            stopMovingBlock(blockToMove.id);
                            stopMovingBlock(otherBlock.id);

                        } else if (collision === 'bounce') {
                            let v1x = blockToMoveAnimData.currentSpeedX;
                            let v1y = blockToMoveAnimData.currentSpeedY;
                            let v2x = otherBlockAnimData.currentSpeedX;
                            let v2y = otherBlockAnimData.currentSpeedY;

                            const nx = dx / distance; // Normal X
                            const ny = dy / distance; // Normal Y

                            const tx = -ny; // Tangent X
                            const ty = nx;  // Tangent Y

                            // Project velocities onto normal and tangent axes
                            const dp_norm1 = v1x * nx + v1y * ny;
                            const dp_tan1 = v1x * tx + v1y * ty;
                            const dp_norm2 = v2x * nx + v2y * ny;
                            const dp_tan2 = v2x * tx + v2y * ty;

                            // Exchange normal velocities (for elastic collision, assuming equal mass)
                            const new_dp_norm1 = dp_norm2;
                            const new_dp_norm2 = dp_norm1;

                            // Convert scalar normal and tangent velocities back to vectors
                            const new_v1x = new_dp_norm1 * nx + dp_tan1 * tx;
                            const new_v1y = new_dp_norm1 * ny + dp_tan1 * ty;
                            const new_v2x = new_dp_norm2 * nx + dp_tan2 * tx;
                            const new_v2y = new_dp_norm2 * ny + dp_tan2 * ty;

                            // Update current speeds for this block and the other block
                            blockToMoveAnimData.currentSpeedX = new_v1x;
                            blockToMoveAnimData.currentSpeedY = new_v1y;
                            otherBlockAnimData.currentSpeedX = new_v2x;
                            otherBlockAnimData.currentSpeedY = new_v2y;

                            // Update angles for next frame (important for resize re-initiation)
                            blockToMoveAnimData.angle = Math.atan2(new_v1y, new_v1x) * 180 / Math.PI;
                            otherBlockAnimData.angle = Math.atan2(new_v2y, new_v2x) * 180 / Math.PI;

                            // Separate the blocks to prevent sticking
                            const overlap = minDistance - distance;
                            const separationX = overlap * nx;
                            const separationY = overlap * ny;

                            blockToMove.x -= separationX * 0.5; // Move half of overlap
                            blockToMove.y -= separationY * 0.5;
                            otherBlock.x += separationX * 0.5; // Move other half of overlap
                            otherBlock.y += separationY * 0.5;

                            // Update visuals for both blocks immediately
                            owningComponent.updateBlockVisuals(blockToMove.id, blockToMove);
                            owningComponent.updateBlockVisuals(otherBlock.id, otherBlock);
                        }
                    }
                }
            }
        }

        owningComponent.updateBlockVisuals(blockId, blockToMove);

        if (stopAnimation) {
            cancelAnimationFrame(activeBlockAnimations.get(blockId).animationFrameId);
            activeBlockAnimations.delete(blockId);
            return;
        }
        
        if (activeBlockAnimations.has(blockId)) {
            const animationFrameId = requestAnimationFrame(animate);
            activeBlockAnimations.get(blockId).animationFrameId = animationFrameId;
        }
    };

    const animationData = {
        animationFrameId: requestAnimationFrame(animate),
        blockId: blockId,
        owningComponent: owningComponent,
        blockObject: blockObject,
        angle: angle,
        pps: pps,
        lastTime: lastTime,
        currentSpeedX: currentSpeedX,
        currentSpeedY: currentSpeedY
    };
    activeBlockAnimations.set(blockId, animationData);

    if (duration > 0) {
        setTimeout(() => {
            stopMovingBlock(blockId);
        }, duration);
    }
}

/**
 * Stops ongoing movement for a block initiated by moveBlock.
 * @param {string} blockId - The ID of the block to stop.
 */
function stopMovingBlock(blockId) {
    if (activeBlockAnimations.has(blockId)) {
        cancelAnimationFrame(activeBlockAnimations.get(blockId).animationFrameId);
        activeBlockAnimations.delete(blockId);
    }
}

// --- Default Animation Setup (now part of paperfold.js) ---

/**
 * A default component that manages and renders a set of animated blocks based on provided configurations.
 */
class DefaultAnimationComponent extends Component {
    constructor(props) {
        super(props);
        this.state = {
            animatedBlocks: {}
        };

        // If initial block configurations are provided, use them
        if (props.initialBlockConfigs && Array.isArray(props.initialBlockConfigs)) {
            props.initialBlockConfigs.forEach(config => {
                const block = new Block(config.blockOptions);
                this.state.animatedBlocks[block.id] = block;
            });
        }
    }

    render() {
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.position = 'relative';

        this.blockElements.clear(); // Clear map before re-rendering

        Object.values(this.state.animatedBlocks).forEach(block => {
            const blockElement = document.createElement('div');
            blockElement.id = block.id;
            // You might want a more robust way to assign classes or styles based on block properties
            blockElement.className = `block-element ${block.shape}`; // Example: 'block-element circle' or 'block-element square'
            if (block.borderColor) { // Add a class based on color for specific styling
                blockElement.classList.add(`${block.borderColor.replace(/[^a-zA-Z0-9]/g, '')}-border`);
            }
            
            blockElement.style.width = `${block.actualWidth}px`;
            blockElement.style.height = `${block.actualHeight}px`;
            blockElement.style.backgroundColor = block.borderColor;
            blockElement.style.border = `${block.borderWidth}px solid ${block.borderColor}`;
            blockElement.style.opacity = block.opaque / 100;
            
            let visualX = block.x;
            let visualY = block.y;
            if (block.shape === 'circle') {
                visualX = block.x - block.radiusX;
                visualY = block.y - block.radiusY;
            }
            blockElement.style.transform = `translate(${visualX}px, ${visualY}px)`;

            container.appendChild(blockElement);
            this.blockElements.set(block.id, blockElement);
        });
        return container;
    }

    componentDidMount() {
        const allCurrentBlocks = Object.values(this.state.animatedBlocks);

        // Start animations based on initialBlockConfigs
        if (this.props.initialBlockConfigs && Array.isArray(this.props.initialBlockConfigs)) {
            this.props.initialBlockConfigs.forEach(config => {
                const block = this.state.animatedBlocks[config.blockOptions.id];
                if (block) {
                    moveBlock(
                        block,
                        config.animationOptions.angle,
                        config.animationOptions.pps,
                        this,
                        config.animationOptions.boundary,
                        config.animationOptions.collision,
                        config.animationOptions.duration,
                        allCurrentBlocks
                    );
                }
            });
        }

        window.addEventListener('resize', () => {
            Object.keys(this.state.animatedBlocks).forEach(blockId => {
                stopMovingBlock(blockId);
            });
            // Re-start animations, preserving current states or re-initializing as per original configs
            // For simplicity, re-using the initial configs for resize.
            // In a more complex app, you'd store current animation state or re-calculate positions.
            if (this.props.initialBlockConfigs && Array.isArray(this.props.initialBlockConfigs)) {
                this.props.initialBlockConfigs.forEach(config => {
                    const block = this.state.animatedBlocks[config.blockOptions.id];
                    if (block) {
                        // Reset block position on resize for consistent starting point if needed,
                        // or just restart animation from current position. For this example,
                        // we'll restart from initial config positions on resize.
                        block.x = config.blockOptions.x;
                        block.y = config.blockOptions.y;

                        moveBlock(
                            block,
                            config.animationOptions.angle,
                            config.animationOptions.pps,
                            this,
                            config.animationOptions.boundary,
                            config.animationOptions.collision,
                            config.animationOptions.duration,
                            allCurrentBlocks
                        );
                    }
                });
            }
        });
    }
}

/**
 * Initializes the Paperfold.js animation on the specified root element.
 * This function encapsulates the entire animation setup and allows for customization.
 * @param {string} appRootId - The ID of the HTML element where the animation should be rendered.
 * @param {Array<Object>} [blockConfigurations=[]] - An array of objects, each defining a block and its animation.
 * Each object should have:
 * - `blockOptions`: An object with properties for the Block constructor (e.g., id, shape, x, y, size, borderColor).
 * - `animationOptions`: An object with properties for moveBlock (e.g., angle, pps, boundary, collision, duration).
 */
function initializePaperfoldAnimation(appRootId, blockConfigurations = []) {
    window.onload = function() {
        const appRoot = document.getElementById(appRootId);
        if (appRoot) {
            // Pass blockConfigurations as props to the DefaultAnimationComponent
            new PaperfoldApp(class extends DefaultAnimationComponent {
                constructor(props) {
                    super({ ...props, initialBlockConfigs: blockConfigurations });
                }
            }, appRoot);
        } else {
            console.error(`Paperfold.js: App container element with ID '${appRootId}' not found.`);
        }
    };
}
