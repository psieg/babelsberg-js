module('users.timfelgentreff.vanoverveld.sketchpad').requires().toRun(function() {

// --------------------------------------------------------------------
// Global Messy Stuff -- TODO: Seems to be Sketchpad14 drawing related... remove?
// --------------------------------------------------------------------

// Object.extend({
//     __idCtr: 1
// });

// Object.addMethods({
//     get __id() {
//         if (!this.hasOwnProperty('___id'))
//             this.___id = Object.__idCtr++
//         return this.___id
//     },
//     get __type() {
//         if (!this.hasOwnProperty('___type'))
//             this.___type = this.constructor.name.replace(/__/g, '.')
//         return this.___type
//     },
//     get __shortType() {
//         var res = this.__type
//         return res.substring(res.lastIndexOf('.') + 1)
//     },
//     get __toString() {
//         return this.__shortType + '@' + this.__id
//     },
//     get __scratch() {
//         if (!this.hasOwnProperty('___scratch'))
//             this.___scratch = {}
//         return this.___scratch
//     }
// });

// --------------------------------------------------------------------
// Public
// --------------------------------------------------------------------

function Sketchpad() {
    this.clear()
}

Object.extend(Global, {
    Sketchpad: Sketchpad
});

Sketchpad.prototype.addClass = function(aClass, isConstraint) {
    var className = aClass.name.replace(/__/g, '.')
    var list = isConstraint ? this.constraintConstructors : this.thingConstructors    
    list[className] = aClass
    aClass.prototype.__isSketchpadThing = true
    aClass.prototype.__isConstraint = isConstraint
}

Sketchpad.prototype.markObjectWithIdIfNew = function(obj) {
    var id = obj.__id
    if (this.objMap[id])
    return true
    this.objMap[id] = obj
    return false
}

Sketchpad.prototype.getObject = function(id) {
    return this.objMap[id]
}

Sketchpad.prototype.addConstraint = function(constraint) {
    if (!constraint.__priority)
    constraint.__priority = 0
    //this.constraints.push(constraint)
    var prio = constraint.__priority
    var addIdx = 0
    while (addIdx < this.constraints.length && this.constraints[addIdx].__priority < prio)
    addIdx++
    if (this.solveEvenWithoutErrorOnPriorityDifferences) {
    this.addToPerThingPerPropertyEffectorsForConstraint(constraint, this.perThingPerPropEffectingConstraints)
    this.computeConstraintsCompetingWithALowerPriorityOneForConstraint(constraint)
    }
    this.constraints.splice(addIdx, 0, constraint)
    for (var p in constraint) {
    if (constraint.hasOwnProperty(p)) {
        var obj = constraint[p]
        if (obj !== undefined && !this.objMap[obj.__id])
        this.objMap[obj.__id] = obj
    }
    }
    return constraint
}

Sketchpad.prototype.removeConstraint = function(unwantedConstraint) {
    var self = this
    this.constraints = this.constraints.filter(function(constraint) {
    return constraint !== unwantedConstraint &&
            !(involves(constraint, unwantedConstraint))
    })
    if (this.solveEvenWithoutErrorOnPriorityDifferences)
    this.computePerThingPerPropertyEffectors()
}

Sketchpad.prototype.clear = function() {
    this.rho = 0.25
    this.epsilon = 0.01
    this.searchOn = false
    this.solveEvenWithoutError = false
    this.solveEvenWithoutErrorOnPriorityDifferences = false
    this.constraints = []
    this.objMap = {}
    this.eventHandlers = []
    this.events = []
    this.thingsWithOnEachTimeStepFn = []
    this.thingsWithAfterEachTimeStepFn = []
    this.perThingPerPropEffectingConstraints = {}
    this.startTime = Date.now()
    this.pseudoTime = 0
    this.prevPseudoTime = 0
    this.scratch = {}
    // remove existing event handlers
    for (var name in this.eventHandlersInternal)
    this.eventHandlersInternal[name].forEach(function(handler) { document.body.removeEventListener(name, handler) })
    this.eventHandlersInternal = {}
    this.eventDescriptions = {}
    this.onEachTimeStepHandlerDescriptions = {}
}

Sketchpad.prototype.computeCurrentError = function() {
    var pseudoTime = this.pseudoTime
    var prevPseudoTime = this.prevPseudoTime 
    var totalError = 0
    for (var idx = 0; idx < this.constraints.length; idx++) {
    var c = this.constraints[idx]
    var er = Math.abs(c.computeError(pseudoTime, prevPseudoTime))    
    totalError += er
    }
    return totalError
}
    
Sketchpad.prototype.collectPerConstraintSolutions = function(timeMillis, inFixPointProcess) {
    var pseudoTime = this.pseudoTime
    var prevPseudoTime = this.prevPseudoTime 
    var self = this
    var allSolutions = []
    var didSomething = false, localDidSomething = false, totalError = 0
    for (var idx = 0; idx < this.constraints.length; idx++) {
    var c = this.constraints[idx]
    var searchable = c.__searchable
    if (inFixPointProcess && searchable)
        continue
    var er = Math.abs(c.computeError(pseudoTime, prevPseudoTime))    
    totalError += er
    if (er > self.epsilon
        || this.solveEvenWithoutError || (this.solveEvenWithoutErrorOnPriorityDifferences && this.constraintIsCompetingWithALowerPriorityOne(c))
       ) {
        var solutions = c.solve(pseudoTime, prevPseudoTime)
        if (!(inFixPointProcess || searchable))
        solutions = [solutions]
        localDidSomething = true
        allSolutions.push({constraint: c, solutions: solutions})
    }
    }
    if (localDidSomething) {
    didSomething = true
    } else
    totalError = 0
    return {didSomething: didSomething, error: totalError, solutions: allSolutions}
}

Sketchpad.prototype.collectPerPropertySolutions = function(allSolutions) {
    var self = this
    var collectedSolutions = {}, seenPriorities = {}
    allSolutions.forEach(function(d) {
    collectPerPropertySolutionsAddSolution(self, d, collectedSolutions, seenPriorities)
    })
    return collectedSolutions
}

Sketchpad.prototype.doOneIteration = function(timeMillis) {
    if (this.beforeEachIteration)
    (this.beforeEachIteration)()
    var res = this.collectPerConstraintSolutions(timeMillis, true)
    var didSomething = res.didSomething
    var totalError = res.error
    if (didSomething) {
    var allSolutions = res.solutions
    var collectedSolutions = this.collectPerPropertySolutions(allSolutions)
    applySolutions(this, collectedSolutions)
    }
    return totalError
}

Sketchpad.prototype.computePerThingPerPropertyEffectors = function() {
    var res = {}
    this.constraints.forEach(function(c) {
    this.addToPerThingPerPropertyEffectorsForConstraint(c, res)
    }.bind(this))
    this.perThingPerPropEffectingConstraints = res  
    this.computeConstraintsCompetingWithALowerPriorityOne()
}

Sketchpad.prototype.addToPerThingPerPropertyEffectorsForConstraint = function(c, res) {
    if (c.effects) {
    c.effects().forEach(function(e) { 
        var id = e.obj.__id
        var eProps = e.props
        var props, cs
        if (res[id])
        props = res[id]
        else {
        props = {}
        res[id] = props
        }
        eProps.forEach(function(prop) {
        if (props[prop])
            cs = props[prop]
        else {
            cs = []
            props[prop] = cs
        }
        cs.push(c)        
        })
    })        
    }
}

Sketchpad.prototype.constraintIsCompetingWithALowerPriorityOne = function(constraint) {
    return this.computeConstraintsCompetingWithALowerPriorityOne[constraint.__id] !== undefined
}

Sketchpad.prototype.computeConstraintsCompetingWithALowerPriorityOneForConstraint = function(constraint) {
    for (var id in this.perThingPerPropEffectingConstraints) {
    var thingEffs = this.perThingPerPropEffectingConstraints[id]
    for (var p in thingEffs) {
        var cs = thingEffs[p]
        if (cs.indexOf(constraint) >= 0) {
        for (var i = 0; i < cs.length; i++) {
            var c = cs[i]
            if (c !== constraint && c.__priority < constraint.__priority) {
            this.computeConstraintsCompetingWithALowerPriorityOne[constraint.__id] = true
            return
            }
        }
        }
    }
    }
}

Sketchpad.prototype.computeConstraintsCompetingWithALowerPriorityOne = function() {    
    this.constraints.forEach(function(constraint) {    
    this.computeConstraintsCompetingWithALowerPriorityOneForConstraint(constraint)
    }.bind(this))
}

Sketchpad.prototype.currentTime = function() {
    return Date.now() - this.startTime
}

Sketchpad.prototype.doTasksOnEachTimeStep = function(pseudoTime, prevPseudoTime) {
    this.handleEvents()
    this.doOnEachTimeStepFns(pseudoTime, prevPseudoTime)
    if (this.onEachTimeStep) 
    (this.onEachTimeStep)(pseudoTime, prevPseudoTime)
}

Sketchpad.prototype.doTasksAfterEachTimeStep = function(pseudoTime, prevPseudoTime) {
    this.doAfterEachTimeStepFns(pseudoTime, prevPseudoTime)
    if (this.afterEachTimeStep) 
    (this.afterEachTimeStep)(pseudoTime, prevPseudoTime)
    this.maybeStepPseudoTime()
}

Sketchpad.prototype.computeNextPseudoTimeFromProposals = function(pseudoTime, proposals) {
    var res = proposals[0].time
    for (var i = 1; i < proposals.length; i++) {
    time = proposals[i].time
    if (time < res)
        res = time
    }
    return res
}

Sketchpad.prototype.maybeStepPseudoTime = function() {
    var o = {}
    var pseudoTime = this.pseudoTime
    this.prevPseudoTime = pseudoTime
    var proposals = []
    this.constraints.forEach(function(t) {
        if(t.proposeNextPseudoTime)
            proposals.push({proposer: t, time: t.proposeNextPseudoTime(pseudoTime)})
    })
    if (proposals.length > 0)
    this.pseudoTime = this.computeNextPseudoTimeFromProposals(pseudoTime, proposals)    
}

Sketchpad.prototype.iterateSearchChoicesForUpToMillis = function(timeMillis) {
    var epsilon = this.epsilon
    var sols = this.collectPerConstraintSolutions(timeMillis, false)
    var didSomething = sols.didSomething
    var totalError = sols.error
    var res = {error: totalError, count: 0} //FIXME
    if (didSomething) {
    var allSolutionChoices = sols.solutions
    //find all solution combinations between constraints
    //log(allSolutionChoices)
    var choicesCs = allSolutionChoices.map(function(c) { return c.constraint })
    var cCount = choicesCs.length
    var choicesSs = allSolutionChoices.map(function(c) { return c.solutions })
    var allSolutionCombos = allCombinationsOfArrayElements(choicesSs).map(function(combo) {        
        var curr = []
        for (var i = 0; i < cCount; i++) {
        curr.push({constraint: choicesCs[i], solutions: combo[i]})
        }
        return curr
    })
    //log(allSolutionCombos)
    // copy curr state and try one, if works return else revert state move to next until none left
    var count = allSolutionCombos.length
    var choiceTO = timeMillis / count
    if (this.debug) log('possible choices', count, 'per choice timeout', choiceTO)
    for (var i = 0; i < count; i++) {
        var copied, last = i == count - 1
        if (this.debug) log('trying choice: ' + i)
        var allSolutions = allSolutionCombos[i]
        //log(allSolutions)
        var collectedSolutions = this.collectPerPropertySolutions(allSolutions)
        //copy here...        
        if (!last)
        copied = this.getCurrentPropValuesAffectableBySolutions(collectedSolutions)
        applySolutions(this, collectedSolutions)
        res = this.iterateForUpToMillis(choiceTO)        
        var choiceErr = this.computeCurrentError()
        //log(choiceErr)
        if (choiceErr < epsilon || last)
        break
        //revert here
        this.revertPropValuesBasedOnArg(copied)
    }
    }
    return res
}

Sketchpad.prototype.getCurrentPropValuesAffectableBySolutions = function(solutions) {
    var res = {}
    for (var objId in solutions) {
    var currObj = sketchpad.objMap[objId]
    var propsN = {}
    res[objId] = propsN
    var props = solutions[objId]
    for (var p in props) {
        propsN[p] = currObj[p]
    }
    }
    return res
}

Sketchpad.prototype.revertPropValuesBasedOnArg = function(values) {
    for (var objId in values) {
    var currObj = sketchpad.objMap[objId]
    var props = values[objId]
    for (var p in props) {
        currObj[p] = props[p]
    }
    }
}

Sketchpad.prototype.solveForUpToMillis = function(tMillis) {
    this.doTasksOnEachTimeStep(this.pseudoTime, this.prevPseudoTime)
    var res
    if (this.searchOn)    
    res = this.iterateSearchChoicesForUpToMillis(tMillis)
    else
    res = this.iterateForUpToMillis(tMillis)
    this.doTasksAfterEachTimeStep(this.pseudoTime, this.prevPseudoTime)
    return res
}

Sketchpad.prototype.iterateForUpToMillis = function(tMillis) {
    var count = 0, totalError = 0, epsilon = this.epsilon
    var currError, lastError
    var t0, t
    t0 = this.currentTime()
    do {
    lastError = currError
    currError = this.doOneIteration(t0)
    t =  this.currentTime() - t0
    if (currError > 0) {
        count++
        totalError += currError
    }
    } while (
    currError > epsilon
        && !(currError >= lastError)
        && t < tMillis)
    return {error: totalError, count: count}
}

// various ways we can join solutions from all solvers
// damped average join fn:
Sketchpad.prototype.sumJoinSolutions = function(curr, solutions) {
    var rho = this.rho
    var sum = 0
    solutions.forEach(function(v) { sum += v })
    var res = curr + (rho * ((sum / solutions.length) - curr))
    return res
}

Sketchpad.prototype.lastOneWinsJoinSolutions = function(curr, solutions) {
    return solutions[solutions.length - 1]
}

Sketchpad.prototype.randomChoiceJoinSolutions = function(curr, solutions) {
    return solutions[Math.floor(Math.random() * solutions.length)]
}

Sketchpad.prototype.arrayAddJoinSolutions = function(curr, solutions) {
    solutions.forEach(function(v) { curr.push(v) })
    return curr
}

Sketchpad.prototype.dictionaryAddJoinSolutions = function(curr, solutions) {
    solutions.forEach(function(v) { for (var k in v) curr[k] = v[k] })
    return curr
}

Sketchpad.prototype.defaultJoinSolutions = function(curr, solutions) {
    return  this.sumJoinSolutions(curr, solutions)
}

Sketchpad.prototype.registerEvent = function(name, callback, optDescription) {
    var id = this.eventHandlers.length
    this.eventHandlers.push(callback)
    var handler = function(e) { this.events.push([id, e]) }.bind(this)
    if (!this.eventHandlersInternal[name]) {
    this.eventHandlersInternal[name] = []
    this.eventDescriptions[name] = []
    }
    this.eventHandlersInternal[name].push(handler)
    this.eventDescriptions[name].push(optDescription)
    document.body.addEventListener(name, handler)
}

Sketchpad.prototype.handleEvents = function() {
    this.events.forEach(function(nameAndE) { 
    var id = nameAndE[0]; 
    var e = nameAndE[1]; 
    var h = this.eventHandlers[id]
    if (h !== undefined)
        h(e) 
    }.bind(this))
    this.events = []
}

Sketchpad.prototype.doOnEachTimeStepFns = function(pseudoTime, prevPseudoTime) {
    this.thingsWithOnEachTimeStepFn.forEach(function(t) { t.onEachTimeStep(pseudoTime, prevPseudoTime) })
}

Sketchpad.prototype.doAfterEachTimeStepFns = function(pseudoTime, prevPseudoTime) {
    this.thingsWithAfterEachTimeStepFn.forEach(function(t) { t.afterEachTimeStep(pseudoTime, prevPseudoTime) })
}

Sketchpad.prototype.setOnEachTimeStep = function(onEachTimeFn, optDescription) {
    this.onEachTimeStep = onEachTimeFn
    if (optDescription)
    this.onEachTimeStepHandlerDescriptions['general'] = [optDescription]
}

Sketchpad.prototype.unsetOnEachTimeStep = function() {
    this.onEachTimeStep = undefined
    delete(this.onEachTimeStepHandlerDescriptions['general'])
}

// --------------------------------------------------------------------
// Private
// --------------------------------------------------------------------
function collectPerPropertySolutionsAddSolution(sketchpad, soln, sofar, seenPriorities) {
    var c = soln.constraint
    var priority = c.__priority
    for (var obj in soln.solutions) {
    var currObj = c[obj]
    var currObjId = currObj.__id
    var d = soln.solutions[obj]
    var keys = Object.keys(d)
    for (var i = 0; i < keys.length; i++) {
        var prop = keys[i]
        var perPropSoln = sofar[currObjId]
        var perPropPrio = seenPriorities[currObjId]
        var propSolns, prio
        if (perPropSoln === undefined) {
        perPropSoln = {}
        perPropPrio = {}
        sofar[currObjId] = perPropSoln
        seenPriorities[currObjId] = perPropPrio
        propSolns = []
        perPropSoln[prop] = propSolns
        perPropPrio[prop] = priority
        } else {            
        propSolns = perPropSoln[prop]
        if (propSolns === undefined) {
            propSolns = []
            perPropSoln[prop] = propSolns
            perPropPrio[prop] = priority
        }
        }
        var lastPrio = perPropPrio[prop]
        if (priority > lastPrio) {
        perPropPrio[prop] = priority
        while (propSolns.length > 0) propSolns.pop()
        } else if (priority < lastPrio) {
        break
        } 
        propSolns.push(d[prop])
    }
    }
}

function applySolutions(sketchpad, solutions) {    
    //log2(solutions)
    var keys1 = Object.keys(solutions)
    for (var i = 0; i < keys1.length; i++) {
    var objId = keys1[i]
    var perProp = solutions[objId]
    var currObj = sketchpad.objMap[objId]
    var keys2 = Object.keys(perProp)
    for (var j = 0; j < keys2.length; j++) {
        var prop = keys2[j]
        var propSolns = perProp[prop]
        var currVal = currObj[prop]
        var joinFn = (currObj.solutionJoins !== undefined && (currObj.solutionJoins())[prop] !== undefined) ?
        (currObj.solutionJoins())[prop] : sketchpad.sumJoinSolutions
        currObj[prop] = (joinFn.bind(sketchpad))(currVal, propSolns)
    }
    }
}

function involves(constraint, obj) {
    for (var p in constraint) {
    if (constraint[p] === obj) {
        return true
    }
    }
    return false
}

function allCombinationsOfArrayElements(arrayOfArrays) {
    if (arrayOfArrays.length > 1) {
    var first = arrayOfArrays[0]
    var rest = allCombinationsOfArrayElements(arrayOfArrays.slice(1))
    var res = []
    for (var j = 0; j < rest.length ; j++) {
        var r = rest[j]
        for (var i = 0; i < first.length; i++) {
        res.push([first[i]].concat(r))
        }
    }
    return res
    }  else if (arrayOfArrays.length == 1) {
    return arrayOfArrays[0].map(function(e) { return [e] })
    } else
    return []
}

}) // end of module
