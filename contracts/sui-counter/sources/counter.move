module sui_counter::counter;

use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct Counter has key {
    id: UID,
    value: u64,
}

public struct Incremented has copy, drop {
    counter_id: ID,
    value: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Counter {
        id: object::new(ctx),
        value: 0,
    });
}

public fun increment(counter: &mut Counter) {
    counter.value = counter.value + 1;
    event::emit(Incremented {
        counter_id: object::id(counter),
        value: counter.value,
    });
}

#[test]
fun increments() {
    let mut ctx = tx_context::dummy();
    let mut counter = Counter {
        id: object::new(&mut ctx),
        value: 0,
    };
    increment(&mut counter);
    assert!(counter.value == 1, 0);
    let Counter { id, value: _ } = counter;
    id.delete();
}
