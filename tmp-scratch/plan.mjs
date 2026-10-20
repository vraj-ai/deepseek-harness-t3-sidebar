import { planDrop } from '../src/model/interactions.ts'
const order = ['a','b','c','d','e']
console.log(JSON.stringify(planDrop({ order, movedId: 'c', targetId: 'e', half: 'before', sameSection: true })))
console.log(JSON.stringify(planDrop({ order, movedId: 'c', targetId: 'a', half: 'after', sameSection: true })))
